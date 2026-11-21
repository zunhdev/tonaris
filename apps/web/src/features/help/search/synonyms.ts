// The words people search Help with that Tonaris says differently (FR-16.4, TON-314): other apps' words (playlist,
// bin, backup), everyday words (password, friend, mobile) and misnamings. A query that uses one also looks for
// Tonaris's words, which count a little less than the reader's own. Keys and values are plain lower-case words or
// phrases; search normalizes and stems them as it does everything else. Each page's frontmatter `keywords` covers
// what is particular to it; this list covers what many pages share.

const groups: Record<string, readonly string[]> = {
  // Collections and lists
  playlist: ["list"],
  playlists: ["lists"],
  library: ["collection"],
  category: ["folder"],
  genre: ["folder", "list"],
  directory: ["folder"],
  subfolder: ["folder"],
  record: ["album"],
  records: ["albums"],
  lp: ["album"],
  release: ["album"],
  ep: ["album"],
  single: ["album"],
  track: ["song"],
  tracks: ["songs"],
  duplicate: ["once", "copy"],
  duplicates: ["once", "copy"],
  // Order
  reorder: ["rearrange", "order"],
  rank: ["order", "manual"],
  ranking: ["order", "manual"],
  arrange: ["rearrange"],
  // Deleting and getting back
  bin: ["trash"],
  recycle: ["trash"],
  garbage: ["trash"],
  rubbish: ["trash"],
  undelete: ["restore", "trash"],
  recover: ["restore", "trash"],
  erase: ["delete"],
  // Data
  backup: ["export", "download"],
  download: ["export"],
  archive: ["export"],
  import: ["paste", "links", "add"],
  csv: ["export"],
  json: ["export"],
  // Accounts
  login: ["sign in"],
  logon: ["sign in"],
  signin: ["sign in"],
  logout: ["sign out"],
  password: ["sign in", "code", "passkey"],
  otp: ["code"],
  register: ["join", "invitation"],
  signup: ["join", "invitation"],
  username: ["display name"],
  nickname: ["display name"],
  photo: ["avatar"],
  picture: ["avatar", "cover"],
  // Fields
  tag: ["custom field"],
  tags: ["custom fields"],
  label: ["custom field"],
  rating: ["custom field", "rating"],
  rate: ["custom field", "rating"],
  stars: ["rating", "custom field"],
  notes: ["custom field", "description"],
  metadata: ["details", "custom field"],
  attribute: ["custom field"],
  format: ["custom field", "format"],
  vinyl: ["custom field", "edition"],
  cd: ["custom field", "edition"],
  // Covers
  artwork: ["cover"],
  art: ["cover"],
  image: ["cover"],
  thumbnail: ["cover"],
  // Keys
  hotkey: ["keyboard", "shortcut"],
  hotkeys: ["keyboard", "shortcuts"],
  keybinding: ["keyboard", "shortcut"],
  keybindings: ["keyboard", "shortcuts"],
  shortcut: ["keyboard", "key"],
  cheatsheet: ["cheat sheet", "shortcuts"],
  keys: ["keyboard", "shortcuts"],
  mouse: ["keyboard"],
  // Devices and installing
  mobile: ["phone"],
  iphone: ["phone"],
  android: ["phone"],
  smartphone: ["phone"],
  tablet: ["phone", "ipad"],
  pwa: ["install", "app"],
  desktop: ["computer", "install"],
  dock: ["install"],
  taskbar: ["install"],
  homescreen: ["home screen", "install"],
  offline: ["offline", "connection"],
  internet: ["connection", "offline"],
  devices: ["device", "sync"],
  // AI
  ai: ["agent"],
  chatgpt: ["agent", "chatgpt"],
  claude: ["agent", "claude"],
  codex: ["agent", "codex"],
  assistant: ["agent"],
  bot: ["agent"],
  llm: ["agent"],
  gpt: ["agent", "chatgpt"],
  mcp: ["agent"],
  // Sharing
  friend: ["share", "invite", "people"],
  friends: ["share", "invite", "people"],
  family: ["share", "invite"],
  collaborate: ["edit", "share"],
  collaborator: ["edit", "share"],
  collaborators: ["edit", "share"],
  public: ["link", "share"],
  url: ["link"],
  permission: ["role", "can edit", "can view"],
  permissions: ["role", "can edit", "can view"],
  access: ["role", "share"],
  // Looks
  theme: ["dark", "theme"],
  grid: ["covers"],
  // Playing
  play: ["open", "listen"],
  listen: ["open", "listen"],
  stream: ["open", "service"],
};

/** Phrases that mean one thing together, as a reader types them. */
const phrases: Record<string, readonly string[]> = {
  "log in": ["sign in"],
  "log out": ["sign out"],
  "sign up": ["join", "invitation"],
  "recycle bin": ["trash"],
  "home screen": ["install", "home screen"],
  "dark mode": ["theme", "dark"],
  "light mode": ["theme", "dark"],
  "profile picture": ["avatar"],
  "release date": ["year"],
  "close my account": ["delete account"],
  "cancel my account": ["delete account"],
  "edit together": ["can edit", "share"],
  "desktop app": ["install", "app"],
  "how many": ["limits"],
  "magic link": ["sign in", "code"],
  "who can see": ["share", "role"],
  "get back": ["restore", "trash"],
  "bring back": ["restore", "trash"],
  "which album": ["choose", "match"],
};

/** What Tonaris calls the reader's `word`, if it calls it something else. */
export function synonymsOf(word: string): readonly string[] {
  return groups[word.toLowerCase()] ?? [];
}

/** What Tonaris calls the phrases in the reader's `query`. */
export function phraseSynonyms(query: string): readonly string[] {
  const lower = ` ${query.toLowerCase().replaceAll(/\s+/g, " ")} `;
  return Object.entries(phrases).flatMap(([phrase, words]) =>
    lower.includes(` ${phrase} `) ? words : [],
  );
}
