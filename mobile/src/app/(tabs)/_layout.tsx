import { useQuickActionRouting } from 'expo-quick-actions/router'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { C } from '@/theme'

export default function Tabs() {
  // The app icon's quick actions (app.json, expo-quick-actions): Log injection, BP, weight, Check in open that sheet.
  // Here and not in the root layout, so the tabs are there to open it over.
  useQuickActionRouting()
  return (
    <NativeTabs tintColor={C.primary}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="labs">
        <NativeTabs.Trigger.Label>Bloods</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="testtube.2" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="timeline">
        <NativeTabs.Trigger.Label>Timeline</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar.day.timeline.left" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="you">
        <NativeTabs.Trigger.Label>You</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
