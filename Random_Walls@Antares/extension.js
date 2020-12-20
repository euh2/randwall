const { GObject, Shell, St } = imports.gi;
const Main = imports.ui.main;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Interval = Me.imports.assets.timeout;
const Wallpapers = Me.imports.assets.wallpapers;
const Chooser = Me.imports.assets.pictureChooser;
const MyConfig = Me.imports.prefs;
const Lang = imports.lang;
const Tweener = imports.tweener.tweener;


const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Gettext = imports.gettext.domain('randwall');
const _ = Gettext.gettext;

const SETTINGS_FOLDER_LIST = "folder-list";
const SETTINGS_CHANGE_MODE = "change-mode";
const SETTINGS_HIDE_ICON = "hide-icon";
const SETTINGS_TIMEOUT = "change-time";

const CURRENT_DESK = 0;
const CURRENT_LOCK = 1;
const NEXT_DESK = 2;
const NEXT_LOCK = 3;

let metadata = Me.metadata;
let settings;
var MyTimer;
let wallUtils;

const LabelWidget = GObject.registerClass(
  class LabelWidget extends PopupMenu.PopupBaseMenuItem {
    _init(text, type) {
      super._init({
        reactive: false
      });

      this._label = new St.Label({
        text: text,
        style_class: "labels"
      });
      //Add type to stylesheet.css if you want different styles
      this._label.add_style_class_name(type);

      this.add_child(this._label);
    }

    setText(text) {
      this._label.text = text;
    }
  });


const ControlButton = GObject.registerClass(
  class ControlButton extends St.Button {
    _init(icon, callback) {
      this.icon = new St.Icon({
        icon_name: icon + "-symbolic", // Get the symbol-icons.
        icon_size: 20
      });

      super._init({
        style_class: 'notification-icon-button control-button', // buttons styled like in Rhythmbox-notifications
        child: this.icon
      })

      this.icon.set_style('padding: 0px');
      this.set_style('padding: 8px'); // Put less space between buttons

      if (callback != undefined || callback != null) {
        this.connect('clicked', callback);
      }
    }

    setIcon(icon) {
      this.icon.icon_name = icon + '-symbolic';
    }
  });

const ConfigControls = GObject.registerClass(
  class ConfigControls extends PopupMenu.PopupBaseMenuItem {
    _init() {
      super._init({
        reactive: false
      });

      this.box = new St.BoxLayout({
        x_expand: "true",
        y_expand: "true",
        style_class: "controls",
      });

      this.box.expand = true;

      this.add_child(this.box);
      this.box.add_actor(new ControlButton("list-add", this._openConfigWidget));

    }

    _openConfigWidget() {
      let _appSys = Shell.AppSystem.get_default();
      let _gsmPrefs = _appSys.lookup_app("org.gnome.Extensions.desktop");
      if (_gsmPrefs.get_state() == _gsmPrefs.SHELL_APP_STATE_RUNNING) {
        _gsmPrefs.activate();
      } else {
        let info = _gsmPrefs.get_app_info();
        let timestamp = global.display.get_current_time_roundtrip();
        info.launch_uris([metadata.uuid], global.create_app_launch_context(timestamp, -1));
      }
    }
  });

const NextWallControls = GObject.registerClass(
  class NextWallControls extends PopupMenu.PopupBaseMenuItem {
    _init() {
      super._init({
        reactive: false
      });

      this.box = new St.BoxLayout({
        x_expand: true,
        y_expand: true,
        style_class: "controls",
      });

      let currentMode = _settings.get_string(SETTINGS_CHANGE_MODE);
      if (currentMode == "different") {
        this.box.set_style("padding-left: " + (Chooser.THUMB_WIDTH - 30) + "px;");
      } else {
        this.box.set_style("padding-left: " + ((Chooser.THUMB_WIDTH / 2) - 36) + "px;"); //36 = button_size*2 + padding*2
      }

      this.add_child(this.box);
      this.box.add_actor(new ControlButton("media-playback-start", this._changeWalls));
      this.box.add_actor(new ControlButton("media-playlist-shuffle", this._newNextWalls));

    }

    _changeWalls() {
      if (wallUtils != null)
        wallUtils.changeWallpapers();
    }

    _newNextWalls() {
      if (wallUtils != null)
        wallUtils.setNewNextAndRefresh();
    }
  });

const ThumbPreviews = GObject.registerClass(class ThumbPreviews extends PopupMenu.PopupBaseMenuItem {
  _init(isNextThumbs) {
    super._init();
    this._isNextThumbs = isNextThumbs;
    //Main Box
    let MainBox = new St.BoxLayout({vertical: false});
    //Label + Icon Desktop Wallpaper Box
    let desktopBox = new St.BoxLayout({vertical: true});
    let currentMode = _settings.get_string(SETTINGS_CHANGE_MODE);
    let textLabel, whoami;
    /* 1st step: Label and identifier */
    switch (currentMode) {
      case "different":
      case "desktop":
        textLabel = _("Desktop");
        whoami = (this._isNextThumbs) ? NEXT_DESK : CURRENT_DESK;
        break;
      case "same":
        textLabel = _("Desktop & Lockscreen");
        whoami = (this._isNextThumbs) ? NEXT_DESK : CURRENT_DESK;
        break;
      case "lockscreen":
        textLabel = _("Lockscreen");
        whoami = (this._isNextThumbs) ? NEXT_LOCK : CURRENT_LOCK;
        break;
    }
    desktopBox.add_child(new St.Label({text: textLabel, style_class: "label-thumb"}));
    /* End 1st step */

    /* 2nd step: Create wallIcon (only if not in lockscreen mode)*/
    if (currentMode != "lockscreen") {
      let filewall = wallUtils.getCurrentWall();
      this.wallIcon = new Chooser.ThumbIcon(filewall, function () {
        _indicator.close();
        new Chooser.PictureChooser(whoami, wallUtils).open();
      });
      desktopBox.add_actor(this.wallIcon);
      MainBox.add_child(desktopBox);
      MainBox.add_child(new St.Icon({width: 20}));
    }
    /* End 2nd step */

    /* 3rd step: Create lockIcon (only in "different" and "lockscreen" mode*/
    let lockwhoami = whoami;
    switch (currentMode) {
      case "different":
        //whoami was NEXT or CURRENT desktop on the 1st step. Now is NEXT or CURRENT lock
        lockwhoami = (this._isNextThumbs) ? NEXT_LOCK : CURRENT_LOCK;
      case "lockscreen":
        let lockBox = new St.BoxLayout({vertical: true});
        lockBox.add_child(new St.Label({text: _("Lockscreen"), style_class: "label-thumb"}));
        let lockwall = wallUtils.getCurrentLockWall();
        this.lockIcon = new Chooser.ThumbIcon(lockwall, function () {
          _indicator.close();
          new Chooser.PictureChooser(lockwhoami, wallUtils).open();
        });
        lockBox.add_child(this.lockIcon);
        MainBox.add_child(lockBox);
        break;
    }
    /* End 3nd step*/
    // Add everything to the mainbox
    this.add_actor(MainBox);
  }

  setWallThumb() {
    let newIcon = null;
    if (this._isNextThumbs)
      newIcon = wallUtils.getNextWall();
    else
      newIcon = wallUtils.getCurrentWall();
    Tweener.addTween(this.wallIcon, {
      opacity: 0,
      time: 1,
      transition: 'easeOutQuad',
      onCompleteParams: [this.wallIcon, newIcon],
      onComplete: function (thumb, icon) {
        thumb.set_gicon(icon);
      }
    });
    Tweener.addTween(this.wallIcon, {opacity: 255, delay: 1.3, time: 1, transition: 'easeOutQuad'});
  }


  setLockThumb() {
    let lockIcon = null;
    if (this._isNextThumbs)
      lockIcon = wallUtils.getNextLockWall();
    else
      lockIcon = wallUtils.getCurrentLockWall();
    Tweener.addTween(this.lockIcon, {
      opacity: 0,
      time: 1,
      transition: 'easeOutQuad',
      onCompleteParams: [this.lockIcon, lockIcon],
      onComplete: function (thumb, icon) {
        thumb.set_gicon(icon);
      }
    });
    Tweener.addTween(this.lockIcon, {opacity: 255, delay: 1.3, time: 1, transition: 'easeOutQuad'});
  }
});

const RandWallMenu = GObject.registerClass(
  class RandWallMenu extends PanelMenu.Button {
    _init() {
      super._init(0.0, "randwall");
      // this.mainButton = new PanelMenu.Button(0.0, "randwall");
      // this.menu = this.mainButton.menu;
      // this.actor = this.mainButton.actor;
      let hbox = new St.BoxLayout({style_class: 'panel-status-menu-box'});
      let gicon = imports.gi.Gio.icon_new_for_string(Me.path + "/icons/randwall-symbolic.symbolic.png");
      let icon = new St.Icon({
        style_class: 'system-status-icon randwall-icon',
        gicon: gicon
      });
      hbox.add_child(icon);
      hbox.add_child(PopupMenu.arrowIcon(St.Side.BOTTOM));
      this.add_actor(hbox);

      if (!wallUtils.isEmpty()) {
        //Label current wallpapers
        this.menu.addMenuItem(new LabelWidget(_("CURRENT"), "info"));
        // Current Walls thumbs
        this.currentThumbs = new ThumbPreviews(false);
        this.menu.addMenuItem(this.currentThumbs);
        // Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        //Label current wallpapers
        this.menu.addMenuItem(new LabelWidget(_("NEXT"), "info"));
        // Next Walls thumbs
        this.nextThumbs = new ThumbPreviews(true);
        this.menu.addMenuItem(this.nextThumbs);
        // Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        //Controles
        let control = new NextWallControls();
        this.menu.addMenuItem(control);
      } else {
        this.menu.addMenuItem(new LabelWidget(_("No images found!"), "error"));
        this.menu.addMenuItem(new LabelWidget(_("Please, add some folders with images"), "info"));
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(new ConfigControls());
      }

    }

    _changeBackgrounds() {
      wallUtils.changeWallpapers();
      //update thumbs
      this.refreshThumbs();
    }

    close() {
      this.menu.close();
    }
  });


function init(metadata) {
  _settings = Convenience.getSettings();
  Convenience.initTranslations();
  wallUtils = new Wallpapers.WallUtils(_settings);
  if (!wallUtils.isEmpty()) {
    this.MyTimer = new Interval.MyTimer();
    this.MyTimer.setCallback(function () {
      //	WARNING! Without the return true the timer will stop after the first run
      if (_settings.get_int(SETTINGS_TIMEOUT) != 0) {
        wallUtils.changeWallpapers();
        return true;
      } else
        return false;
    });
  }
  let theme = imports.gi.Gtk.IconTheme.get_default();
  theme.append_search_path(metadata.path + "/icons");
}

let _indicator;
let _settings;

function enable() {
  _indicator = new RandWallMenu(_settings);

  wallUtils.setIndicator(_indicator);
  if (!wallUtils.isEmpty() && this.MyTimer && _settings.get_int(SETTINGS_TIMEOUT) != 0) {
    wallUtils.changeWallpapers();
    this.MyTimer.start();
  }
  let hideIcon = _settings.get_boolean(SETTINGS_HIDE_ICON);

  if (!hideIcon)
    Main.panel.addToStatusArea('randwall', _indicator, 1, 'right');

  _settings.connect('changed::' + SETTINGS_HIDE_ICON, Lang.bind(this, applyChanges));
  _settings.connect('changed::' + SETTINGS_CHANGE_MODE, Lang.bind(this, applyChanges));
  _settings.connect('changed::' + SETTINGS_FOLDER_LIST, Lang.bind(this, applyChanges));
}

function applyChanges() {
  if (!_indicator || !wallUtils || !_settings)
    return;

  _indicator.destroy();
  wallUtils = new Wallpapers.WallUtils(_settings);
  _indicator = new RandWallMenu(_settings);
  wallUtils.setIndicator(_indicator);
  let hideIcon = _settings.get_boolean(SETTINGS_HIDE_ICON);
  if (!hideIcon)
    Main.panel.addToStatusArea('randwall', _indicator, 1, 'right');
  wallUtils.setNewNextAndRefresh();
}

function disable() {
  _indicator.destroy();

  if (this.MyTimer) {
    this.MyTimer.stop();
  }
}
