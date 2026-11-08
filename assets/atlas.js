// tools/build_atlas.py가 만든 파일. 직접 고치지 않는다.
// 이 파일이나 이미지가 없으면 게임은 도형으로 그린다.
export const ATLAS = {
 "images": {
  "tiles": "assets/tiles.png",
  "rooms": "assets/rooms.png",
  "parts": "assets/parts.png",
  "people": "assets/people.png",
  "props": "assets/props.png",
  "icons": "assets/icons.png",
  "ui": "assets/ui.png",
  "fog": "assets/fog.png"
 },
 "sprites": {
  "tile.forest": {
   "img": "tiles",
   "x": 0,
   "y": 0,
   "w": 128,
   "h": 128
  },
  "tile.ruins": {
   "img": "tiles",
   "x": 130,
   "y": 0,
   "w": 128,
   "h": 128
  },
  "tile.farm": {
   "img": "tiles",
   "x": 260,
   "y": 0,
   "w": 128,
   "h": 128
  },
  "tile.reservoir": {
   "img": "tiles",
   "x": 390,
   "y": 0,
   "w": 128,
   "h": 128
  },
  "tile.box": {
   "img": "tiles",
   "x": 520,
   "y": 0,
   "w": 128,
   "h": 128
  },
  "tile.camp": {
   "img": "tiles",
   "x": 650,
   "y": 0,
   "w": 128,
   "h": 128
  },
  "tile.nest": {
   "img": "tiles",
   "x": 780,
   "y": 0,
   "w": 128,
   "h": 128
  },
  "tile.base": {
   "img": "tiles",
   "x": 0,
   "y": 130,
   "w": 128,
   "h": 128
  },
  "tile.fog": {
   "img": "tiles",
   "x": 130,
   "y": 130,
   "w": 128,
   "h": 128
  },
  "tile.entrance": {
   "img": "tiles",
   "x": 260,
   "y": 130,
   "w": 128,
   "h": 128
  },
  "tile.barren": {
   "img": "tiles",
   "x": 390,
   "y": 130,
   "w": 128,
   "h": 128
  },
  "tile.nestCleared": {
   "img": "tiles",
   "x": 520,
   "y": 130,
   "w": 128,
   "h": 128
  },
  "room.generator": {
   "img": "rooms",
   "x": 0,
   "y": 0,
   "w": 240,
   "h": 140
  },
  "room.water": {
   "img": "rooms",
   "x": 242,
   "y": 0,
   "w": 240,
   "h": 140
  },
  "room.farm": {
   "img": "rooms",
   "x": 484,
   "y": 0,
   "w": 240,
   "h": 140
  },
  "room.quarters": {
   "img": "rooms",
   "x": 726,
   "y": 0,
   "w": 240,
   "h": 140
  },
  "room.workshop": {
   "img": "rooms",
   "x": 0,
   "y": 142,
   "w": 240,
   "h": 140
  },
  "room.medbay": {
   "img": "rooms",
   "x": 242,
   "y": 142,
   "w": 240,
   "h": 140
  },
  "room.radio": {
   "img": "rooms",
   "x": 484,
   "y": 142,
   "w": 240,
   "h": 140
  },
  "room.emptyWide": {
   "img": "rooms",
   "x": 726,
   "y": 142,
   "w": 240,
   "h": 140
  },
  "room.shaft": {
   "img": "parts",
   "x": 0,
   "y": 0,
   "w": 120,
   "h": 140
  },
  "room.storage": {
   "img": "parts",
   "x": 122,
   "y": 0,
   "w": 120,
   "h": 140
  },
  "room.guard": {
   "img": "parts",
   "x": 244,
   "y": 0,
   "w": 120,
   "h": 140
  },
  "cell.cave": {
   "img": "parts",
   "x": 366,
   "y": 0,
   "w": 120,
   "h": 140
  },
  "soil.top": {
   "img": "parts",
   "x": 488,
   "y": 0,
   "w": 128,
   "h": 128
  },
  "soil.deep": {
   "img": "parts",
   "x": 618,
   "y": 0,
   "w": 128,
   "h": 128
  },
  "ground.strip": {
   "img": "parts",
   "x": 748,
   "y": 0,
   "w": 160,
   "h": 120
  },
  "door.side": {
   "img": "parts",
   "x": 0,
   "y": 142,
   "w": 120,
   "h": 100
  },
  "surv.gather.0": {
   "img": "people",
   "x": 0,
   "y": 0,
   "w": 68,
   "h": 96
  },
  "surv.build.0": {
   "img": "people",
   "x": 70,
   "y": 0,
   "w": 68,
   "h": 96
  },
  "surv.combat.0": {
   "img": "people",
   "x": 140,
   "y": 0,
   "w": 80,
   "h": 96
  },
  "surv.tech.0": {
   "img": "people",
   "x": 222,
   "y": 0,
   "w": 64,
   "h": 96
  },
  "surv.gather.1": {
   "img": "people",
   "x": 288,
   "y": 0,
   "w": 80,
   "h": 96
  },
  "surv.build.1": {
   "img": "people",
   "x": 370,
   "y": 0,
   "w": 95,
   "h": 96
  },
  "surv.combat.1": {
   "img": "people",
   "x": 467,
   "y": 0,
   "w": 110,
   "h": 96
  },
  "surv.tech.1": {
   "img": "people",
   "x": 579,
   "y": 0,
   "w": 111,
   "h": 96
  },
  "zombie.normal": {
   "img": "props",
   "x": 0,
   "y": 0,
   "w": 87,
   "h": 96
  },
  "zombie.runner": {
   "img": "props",
   "x": 89,
   "y": 0,
   "w": 112,
   "h": 96
  },
  "zombie.brute": {
   "img": "props",
   "x": 203,
   "y": 0,
   "w": 128,
   "h": 128
  },
  "turret": {
   "img": "props",
   "x": 333,
   "y": 0,
   "w": 106,
   "h": 96
  },
  "crane": {
   "img": "props",
   "x": 441,
   "y": 0,
   "w": 180,
   "h": 192
  },
  "scaffold": {
   "img": "props",
   "x": 623,
   "y": 0,
   "w": 175,
   "h": 140
  },
  "frame": {
   "img": "props",
   "x": 800,
   "y": 0,
   "w": 168,
   "h": 140
  },
  "pickaxe": {
   "img": "props",
   "x": 970,
   "y": 0,
   "w": 41,
   "h": 48
  },
  "icon.food": {
   "img": "icons",
   "x": 0,
   "y": 0,
   "w": 70,
   "h": 64
  },
  "icon.water": {
   "img": "icons",
   "x": 72,
   "y": 0,
   "w": 49,
   "h": 64
  },
  "icon.wood": {
   "img": "icons",
   "x": 123,
   "y": 0,
   "w": 72,
   "h": 64
  },
  "icon.scrap": {
   "img": "icons",
   "x": 197,
   "y": 0,
   "w": 74,
   "h": 64
  },
  "icon.power": {
   "img": "icons",
   "x": 273,
   "y": 0,
   "w": 47,
   "h": 64
  },
  "icon.parts": {
   "img": "icons",
   "x": 322,
   "y": 0,
   "w": 54,
   "h": 64
  },
  "icon.pop": {
   "img": "icons",
   "x": 378,
   "y": 0,
   "w": 56,
   "h": 64
  },
  "icon.injured": {
   "img": "icons",
   "x": 436,
   "y": 0,
   "w": 60,
   "h": 64
  },
  "icon.powerOff": {
   "img": "icons",
   "x": 498,
   "y": 0,
   "w": 51,
   "h": 64
  },
  "icon.warn": {
   "img": "icons",
   "x": 551,
   "y": 0,
   "w": 70,
   "h": 64
  },
  "ui.barTrack": {
   "img": "ui",
   "x": 0,
   "y": 0,
   "w": 262,
   "h": 32
  },
  "ui.barFill": {
   "img": "ui",
   "x": 264,
   "y": 0,
   "w": 323,
   "h": 32
  },
  "ui.barGreen": {
   "img": "ui",
   "x": 589,
   "y": 0,
   "w": 319,
   "h": 32
  },
  "ui.barYellow": {
   "img": "ui",
   "x": 0,
   "y": 34,
   "w": 323,
   "h": 32
  },
  "ui.barRed": {
   "img": "ui",
   "x": 325,
   "y": 34,
   "w": 319,
   "h": 32
  },
  "ui.badge": {
   "img": "ui",
   "x": 646,
   "y": 34,
   "w": 64,
   "h": 64
  },
  "fog.seamless": {
   "img": "fog",
   "x": 0,
   "y": 0,
   "w": 256,
   "h": 256
  }
 }
};
