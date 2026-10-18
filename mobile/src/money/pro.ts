// Magno Pro: bought in the app through Apple (RevenueCat), or on magno.fit through Stripe. RevenueCat is the one
// place that decides (docs/decisions.md): signed in, its customer is the Magno account, so a purchase follows the
// person to the web and back. Until the Stripe account is connected to RevenueCat, the server's own is_pro (Stripe)
// counts as well. Until billing is switched on (app.json extra.billing.live) everyone has Pro.
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { useSyncExternalStore } from 'react'
import { Linking } from 'react-native'
import Purchases, { type CustomerInfo, PACKAGE_TYPE, type PurchasesPackage } from 'react-native-purchases'
import { account } from '@/account/auth'
import { ENTITLEMENT } from './plans'

const cfg = (Constants.expoConfig?.extra?.billing ?? {}) as { live?: boolean; revenuecatIosKey?: string }
export const LIVE = !!cfg.live
const KEY = cfg.revenuecatIosKey ?? ''

let store = false
const subs = new Set<() => void>()
const changed = () => subs.forEach((f) => f())
const fromInfo = (i: CustomerInfo) => {
  store = !!i.entitlements.active[ENTITLEMENT]
  changed()
}

/** Pro, from any source. */
export function hasPro() {
  if (!LIVE) return true
  const a = account()
  return store || (a.status === 'authed' && !!a.user.is_pro)
}
export const usePro = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), hasPro)

let configured = false
/** At launch, once the account is known. */
export function startBilling() {
  if (!LIVE || !KEY || configured) return
  configured = true
  const a = account()
  Purchases.configure({ apiKey: KEY, appUserID: a.status === 'authed' ? a.user.id : undefined })
  Purchases.addCustomerInfoUpdateListener(fromInfo)
  Purchases.getCustomerInfo().then(fromInfo, () => {})
}

/** The account changed: RevenueCat follows it, so purchases belong to the person, not the phone. */
export async function billingFollowsAccount() {
  changed()
  if (!configured) return
  const a = account()
  if (a.status === 'authed') fromInfo((await Purchases.logIn(a.user.id)).customerInfo)
  else if (!(await Purchases.isAnonymous())) fromInfo(await Purchases.logOut())
}

export type StorePlans = { monthly?: PurchasesPackage; lifetime?: PurchasesPackage }
/** The plans as the App Store sells them here; null before billing is set up (the paywall shows list prices). */
export async function storePlans(): Promise<StorePlans | null> {
  if (!LIVE || !KEY) return null
  const packages = (await Purchases.getOfferings()).current?.availablePackages ?? []
  return { monthly: packages.find((p) => p.packageType === PACKAGE_TYPE.MONTHLY), lifetime: packages.find((p) => p.packageType === PACKAGE_TYPE.LIFETIME) }
}

/** Buys a plan; true once Pro is on. A cancelled purchase is false, not an error. */
export async function buy(pkg: PurchasesPackage) {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg)
    fromInfo(customerInfo)
    return !!customerInfo.entitlements.active[ENTITLEMENT]
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return false
    throw e
  }
}

/** Pro bought on another device or before a reinstall. True if it's back. */
export async function restore() {
  if (!LIVE || !KEY) return hasPro()
  fromInfo(await Purchases.restorePurchases())
  return hasPro()
}

export const manageSubscription = () => Linking.openURL('https://apps.apple.com/account/subscriptions')

/** Runs `then` with Pro, or opens the paywall saying which feature asked. */
export function withPro(feature: string, then: () => void) {
  if (hasPro()) return then()
  router.push({ pathname: '/pro', params: { feature } })
}
