// The accounts the e2e API creates (apps/api/src/e2e-server.ts): the creator first, then one per sign-in test,
// so tests can run in parallel without sharing an inbox or a session. Mailpit searches by substring, so no
// address may end with another (`link@…` would also find `used-link@…`).

export const apiUrl = "http://localhost:3101";

const at = (name: string) => `${name}@e2e.tonaris.test`;

export const accounts = {
  creator: at("creator"),
  code: at("typed"),
  session: at("session"),
  link: at("link"),
  device: at("device"),
  usedLink: at("spent"),
  wrongCode: at("wrong"),
  resend: at("resend"),
  signOut: at("sign-out"),
  unsafe: at("unsafe"),
  mcp: at("mcp-client"),
  mcpCancel: at("mcp-cancel"),
  mcpDefault: at("mcp-default"),
  approver: at("approver"),
  stranger: at("stranger"),
  // The sync client in the browser (sync-client.e2e.ts), one per test.
  syncReload: at("sync-reload"),
  syncQueued: at("sync-queued"),
  syncOffline: at("sync-offline"),
  syncTabs: at("sync-tabs"),
  syncHandover: at("sync-handover"),
  syncSignOut: at("sync-leave"),
  // The save-state interface (save-states.e2e.ts), one per test.
  saveSlow: at("save-slow"),
  saveUnanswered: at("save-unanswered"),
  saveFailed: at("save-failed"),
  saveConflict: at("save-conflict"),
  saveOffline: at("save-offline"),
  // Batch reports (batch-report.e2e.ts), one per test.
  batchPartial: at("batch-partial"),
  batchRetryAll: at("batch-retry-all"),
  // The sidebar tree and the collection routes (collection-navigation.e2e.ts), one per test.
  navKeyboard: at("nav-keys"),
  navRoutes: at("nav-routes"),
  navNames: at("nav-names"),
  navOffline: at("nav-offline"),
  // The collection views (collection-views.e2e.ts), one per test.
  viewsList: at("views-list"),
  viewsFolder: at("views-folder"),
  viewsLarge: at("views-large"),
  viewsInspector: at("views-inspector"),
  // Sorting, grouping, View options and defaults (view-options.e2e.ts), one per test.
  orderViews: at("order-views"),
  syncViews: at("sync-views"),
  sortFolders: at("sort-folders"),
  seedLayout: at("seed-layout"),
  // Manual order and moves (manual-order.e2e.ts), one per test.
  arrangeKeys: at("arrange-keys"),
  arrangeDrag: at("arrange-drag"),
  arrangePlaces: at("arrange-places"),
  arrangeMoves: at("arrange-moves"),
  arrangeSync: at("arrange-sync"),
  // Viewing and Editing modes (editing-modes.e2e.ts), one per test.
  modeSwitch: at("mode-switch"),
  modeIntent: at("mode-intent"),
  modeLeave: at("mode-leave"),
  modeCells: at("mode-cells"),
  // The album inspector and manual entry (album-inspector.e2e.ts), one per test.
  inspectorOpen: at("inspector-open"),
  inspectorEdit: at("inspector-edit"),
  inspectorLists: at("inspector-lists"),
  entryRequired: at("entry-required"),
  entryIntoList: at("entry-into-list"),
  albumPage: at("album-page"),
  // Service links (service-links.e2e.ts), one per test.
  linksInspector: at("links-inspector"),
  linksEntry: at("links-entry"),
  // Capture (capture.e2e.ts), one per test.
  captureList: at("capture-list"),
  captureRoot: at("capture-root"),
  captureManual: at("capture-manual"),
  captureFailure: at("capture-failure"),
  captureChoice: at("capture-choice"),
  captureBatch: at("capture-batch"),
  captureKept: at("capture-kept"),
  captureField: at("capture-field"),
  // Opening a service (open-in.e2e.ts), one per test.
  openDesktop: at("open-desktop"),
  openKeys: at("open-keys"),
  openMobile: at("open-mobile"),
  openApp: at("open-app"),
  openList: at("open-list"),
  // Artwork (artwork.e2e.ts), one per test.
  artworkShown: at("artwork-shown"),
  artworkEdited: at("artwork-edited"),
  artworkFound: at("artwork-found"),
  artworkFoundForm: at("artwork-found-form"),
  // The temporary identity (identity.e2e.ts).
  identity: at("identity"),
  // The sidebar's row menu (container-menu.e2e.ts), one per test.
  rowMenu: at("row-menu"),
  rowMenuKeys: at("row-menu-keys"),
  headerRename: at("header-rename"),
  rowMenuCreate: at("row-menu-create"),
  // Closing a folder that holds the view (collection-navigation.e2e.ts).
  closeHolder: at("close-holder"),
  // Custom fields (custom-fields.e2e.ts), one per test.
  fieldsApply: at("fields-apply"),
  fieldsTypes: at("fields-types"),
  fieldsEntry: at("fields-entry"),
  // Settings → Custom fields (custom-fields-settings.e2e.ts), one per test.
  settingsFields: at("settings-fields"),
  settingsOptions: at("settings-options"),
  // Folder and list descriptions (descriptions.e2e.ts).
  descriptions: at("descriptions"),
  // Trash (trash.e2e.ts), one per test.
  trashList: at("trash-list"),
  trashFolder: at("trash-folder"),
  // Recovery prompts (recovery.e2e.ts), one per test.
  recoveryDestination: at("recovery-destination"),
  recoveryName: at("recovery-name"),
  // Album deletion (album-trash.e2e.ts).
  albumTrash: at("album-trash"),
  // The Trash view (trash-view.e2e.ts), one per test.
  trashViewFolders: at("trash-view-folders"),
  trashViewAlbums: at("trash-view-albums"),
  // Settings → Data's usage meter (usage.e2e.ts).
  usage: at("usage"),
  // The search palette (search.e2e.ts), one per test.
  searchResults: at("search-results"),
  searchOpening: at("search-opening"),
  // Palette commands (palette-commands.e2e.ts), one per test.
  paletteCommands: at("palette-commands"),
  paletteRecent: at("palette-recent"),
  // The sharing dialog (sharing-dialog.e2e.ts).
  sharingDialog: at("sharing-dialog"),
  // Invitations (invitations.e2e.ts): the owner, the recipient, and someone else.
  invitingOwner: at("inviting-owner"),
  invitedAnna: at("invited-anna"),
  invitedBen: at("invited-ben"),
  // Guest pages (guest.e2e.ts).
  guestOwner: at("guest-owner"),
  // Shared with me (shared-with-me.e2e.ts): an owner and a viewer.
  sharingOwner: at("sharing-owner"),
  sharingViewer: at("sharing-viewer"),
  // Viewing shared content (shared-viewing.e2e.ts): an owner and a viewer.
  viewingOwner: at("viewing-owner"),
  viewingViewer: at("viewing-viewer"),
  // Sharing previews on moves and recovery (sharing-impact.e2e.ts): an owner and the person they share with.
  impactOwner: at("impact-owner"),
  impactViewer: at("impact-viewer"),
  // Shared content in search (shared-search.e2e.ts): an owner and the person they share with.
  searchOwner: at("search-owner"),
  searchViewer: at("search-viewer"),
  // Admin → Admissions (admission.e2e.ts): a member, who has no Admin.
  adminOutsider: at("admin-outsider"),
  // Settings → Profile (settings-profile.e2e.ts), one per test.
  profileName: at("profile-name"),
  profileGuard: at("profile-guard"),
  // Settings → Account (settings-account.e2e.ts), one per test.
  emailChanger: at("email-changer"),
  emailCanceller: at("email-canceller"),
  // Recovering a sign-in email (email-recovery.e2e.ts), one per test.
  recoverMember: at("recover-member"),
  recoverCancelled: at("recover-cancelled"),
  // Deleting an account (account-deletion.e2e.ts), one per test.
  deleter: at("deleter"),
  exporter: at("exporter"),
  exportBeforeDeleting: at("export-first"),
  hostile: at("hostile"),
  phone: at("phone"),
  phoneOptions: at("phone-options"),
  phoneSearch: at("phone-search"),
  deleteCancel: at("delete-cancel"),
  // Keyboard-only walkthroughs (walkthrough.e2e.ts, TON-93), one per test.
  walker: at("a11y-walker"),
  arrival: at("a11y-arrival"),
  guide: at("a11y-guide"),
} as const;

/** An address with no account. */
export const nobody = at("nobody");

/** New addresses for the email change and recovery tests; none has an account. */
export const newAddresses = {
  moved: at("moved-here"),
  unused: at("never-used"),
  // Where email-recovery.e2e.ts recovers accounts to.
  recovered: at("recovered-here"),
  notRecovered: at("not-recovered"),
} as const;

/** An address the creator invites in admission.e2e.ts; it has no account. */
export const invitee = at("admission-invitee");

/** The people who join in admission.e2e.ts, one per test; none has an account until then. */
export const joiners = {
  member: at("joining-member"),
  elsewhere: at("joining-elsewhere"),
  withdrawn: at("joining-withdrawn"),
} as const;

/** Where the setup project saves the creator's signed-in browser state. */
export const creatorState = "playwright/.auth/creator.json";
