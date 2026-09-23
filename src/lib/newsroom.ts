// Canonical newsroom cast for the War Correspondent. These IDs point at the
// HeyGen trained avatars + voices, so every rendered report uses the same faces.
// Personas feed the script-writer so each stays in voice. Not secret.

export type Role = "anchor" | "field";

export interface Correspondent {
  name: string;
  network: string;
  accent: string; // brand color
  role: Role;
  looks: string[]; // HeyGen photo-avatar look ids (rotate for variety)
  avatarGroupId: string; // HeyGen avatar group (the Look Pack)
  voiceId: string;
  voiceName: string;
  persona: string; // character brief fed to the script-writer to stay in voice
  sampleLine: string; // a one-line example of their voice
}

// Pick a look to render with (rotate for variety across reports).
export function pickLook(c: Correspondent): string {
  return c.looks[Math.floor(Math.random() * c.looks.length)];
}

// 🔴 RED TEAM NEWS ------------------------------------------------------------
export const RED_ANCHOR: Correspondent = {
  name: "Sienna Cole",
  network: "RED TEAM NEWS",
  accent: "#d23b3b",
  role: "anchor",
  avatarGroupId: "cc5bca4d32ac407aa92f08d9e41972f8",
  looks: [
    "e8fdc59e7b994d39b464930c9dedabce",
    "573636c71aa1433c974971402a00c66e",
    "3c857e6b5132460aa024f8ec012c84f1",
    "e8fd71ea30aa472b8364cd84e850a8e7",
    "30d7ba268f5b4d8198f6badd7f286790",
  ],
  voiceId: "0bbfbda5aa924a68a9d1da7b8496052a", // "Skylar"
  voiceName: "Skylar",
  persona:
    "Warm, confident, direct, and emotionally expressive. Viewers trust her because she talks TO them, not at them. Quick to rally the audience, quick to celebrate a Red win, and quick to call out a bad night for Red. Playful humor with a little bite. She doesn't obsess over data — she talks about effort, momentum, and what Red needs to do NEXT.",
  sampleLine:
    "Blue is celebrating three tiles like they won the war. Adorable. Red, get back out there.",
};

export const RED_FIELD: Correspondent = {
  name: "Rowan Cross",
  network: "RED TEAM NEWS",
  accent: "#d23b3b",
  role: "field",
  avatarGroupId: "65ea5c4e57124aa69ebd286b5746add5",
  looks: [
    "575bc6dcb5164a0e8def007c99379687",
    "50fd081c1e054f9d9442e29902f77d02",
    "1c0e5019994a49899ef200b6bf5ee2fb",
    "0bbfefa0bb52402e86fb711b013bceff",
    "c7b3b6756b26462fb1e5159de8f8821c",
  ],
  voiceId: "19ef3da29d1b474ba9225e58b64b5023", // "Warrior Rohan - Broadcaster"
  voiceName: "Warrior Rohan",
  persona:
    "Red's field correspondent, embedded on the front line. Urgent, punchy, and physical — he reports like he's in the middle of it, narrating the action front by front in the present tense. High energy, short sentences. He hypes Red's pushes and calls the chaos live. Where Sienna runs the desk, Rowan is IN the fight and tosses back to her by name.",
  sampleLine:
    "Sienna, I'm on the eastern front and it is CHAOS — Red just punched through the line and Blue is falling back. They were not ready for this.",
};

// 🔵 BLUE TEAM NEWS -----------------------------------------------------------
export const BLUE_ANCHOR: Correspondent = {
  name: "Sterling Wells",
  network: "BLUE TEAM NEWS",
  accent: "#356fd0",
  role: "anchor",
  avatarGroupId: "48bf19181deb4a4cacb1d144d4f444de",
  looks: [
    "b950798aeb554ce4b9e76f77297d6e2b",
    "49e594f3bb794215bdad62884e4e1b40",
    "d92b800c58034cb69d3cfdf970e8a6ea",
    "1791f77c8d6b44bd87d3352aea1d1553",
  ], // (dropped the look with on-image text)
  voiceId: "810ea13d55f045b68c75cbcbda7ce14a", // "Shawn"
  voiceName: "Shawn",
  persona:
    "Calm, sharp, dryly funny, and slightly competitive. Presents himself as the reasonable adult in the room, but absolutely enjoys when Blue gains ground. Rarely raises his voice — which makes his occasional 'Blue, this is unacceptable' moments hit harder. Loves stats, trend lines, and momentum; treats the board like a sports analyst treats a playoff series. Humor is understated and a little smug.",
  sampleLine:
    "Red had a good hour. Unfortunately for them, the day is longer than an hour.",
};

export const BLUE_FIELD: Correspondent = {
  name: "Skye Bennett",
  network: "BLUE TEAM NEWS",
  accent: "#356fd0",
  role: "field",
  avatarGroupId: "e324395418ae414b8ece634decaf2239",
  looks: [
    "3397e024eb4e48c48c45678829327ae7",
    "f7db61b05fa34645bc96f5c438c0580c",
    "d259ba87a62e46b384a32084bca8e343",
    "5a1559b14ce9436899b4085916aa2ac8",
    "5f819e65ddcf45f28c4fc6fc865c3bb2",
    "53cd21e322a14aa4a54d4a37193bd487",
  ],
  voiceId: "ad257b0545cc4892b5400e1cd8efdd9a", // "Radiant Raven"
  voiceName: "Radiant Raven",
  persona:
    "Blue's field correspondent, embedded with Blue forces. Composed but energized — she reports the human side of Blue's push in the present tense, from the ground. Where Sterling analyzes from the desk, Skye shows the fight and the comeback: optimistic, steady, quick to spotlight a Blue rally. A calm counter to Red's Rowan.",
  sampleLine:
    "Sterling, I'm on the eastern flank and Blue is not backing down — we just retook three positions and the line is holding. This isn't over.",
};

export const NEWSROOM = {
  red: { anchor: RED_ANCHOR, field: RED_FIELD },
  blue: { anchor: BLUE_ANCHOR, field: BLUE_FIELD },
} as const;
