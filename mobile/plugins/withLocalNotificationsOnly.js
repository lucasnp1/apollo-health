// Liber's reminders are local notifications only. expo-notifications' own plugin (applied automatically once the
// package is installed) adds the push entitlement, which the App ID doesn't have. (The app no longer signs with the
// team's wildcard profile: Sign in with Apple is a capability, so it gets its own profile, which carries only what the
// App ID has enabled.) Add Push Notifications to the App ID before removing this.
const { withEntitlementsPlist } = require('expo/config-plugins')

module.exports = (config) =>
  withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment']
    return c
  })
