// Apple Health (ios/MagnoHealthModule.swift): weight and blood pressure, both ways. Null where it isn't built in.
import { requireOptionalNativeModule } from 'expo'

export type HealthWeight = { id: string; kg: number; at: number; source: string }
export type HealthBP = { id: string; systolic: number; diastolic: number; at: number; source: string }

type Health = {
  isAvailable(): boolean
  requestAccess(): Promise<boolean>
  writeWeight(id: string, kg: number, at: number): Promise<boolean>
  writeBloodPressure(id: string, systolic: number, diastolic: number, at: number): Promise<boolean>
  readWeights(since: number): Promise<HealthWeight[]>
  readBloodPressure(since: number): Promise<HealthBP[]>
}

const native = requireOptionalNativeModule<Health>('MagnoHealth')
export const Health = native?.isAvailable() ? native : null
