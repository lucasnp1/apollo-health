import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { C } from '@/theme'

export default function Tabs() {
  return (
    <NativeTabs tintColor={C.primary}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="timeline">
        <NativeTabs.Trigger.Label>Timeline</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar.day.timeline.left" />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
