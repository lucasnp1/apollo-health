// Apple Health, both ways, for what Magno and Health share: body weight and blood pressure (with pulse kept on the
// Magno side). Writes carry Magno's own id as HealthKit's sync identifier, so writing the same reading twice replaces it
// instead of doubling it. Reads skip Magno's own samples, so nothing echoes back.
import ExpoModulesCore
import HealthKit

public final class MagnoHealthModule: Module {
  let store = HKHealthStore()
  let mass = HKQuantityType(.bodyMass)
  let sys = HKQuantityType(.bloodPressureSystolic)
  let dia = HKQuantityType(.bloodPressureDiastolic)
  let bp = HKCorrelationType(.bloodPressure)

  public func definition() -> ModuleDefinition {
    Name("MagnoHealth")

    Function("isAvailable") { HKHealthStore.isHealthDataAvailable() }

    // Shows Apple's permission sheet (only the first time; after that iOS answers from what the person chose)
    AsyncFunction("requestAccess") { (promise: Promise) in
      let types: Set<HKSampleType> = [self.mass, self.sys, self.dia]
      self.store.requestAuthorization(toShare: types, read: types) { ok, error in
        if let error { return promise.reject("ERR_HEALTH_AUTH", error.localizedDescription) }
        promise.resolve(ok)
      }
    }

    AsyncFunction("writeWeight") { (id: String, kg: Double, at: Double, promise: Promise) in
      let date = Date(timeIntervalSince1970: at / 1000)
      let sample = HKQuantitySample(type: self.mass, quantity: HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: kg), start: date, end: date, metadata: Self.meta(id))
      self.save([sample], promise)
    }

    AsyncFunction("writeBloodPressure") { (id: String, systolic: Double, diastolic: Double, at: Double, promise: Promise) in
      let date = Date(timeIntervalSince1970: at / 1000)
      let mmHg = HKUnit.millimeterOfMercury()
      let s = HKQuantitySample(type: self.sys, quantity: HKQuantity(unit: mmHg, doubleValue: systolic), start: date, end: date)
      let d = HKQuantitySample(type: self.dia, quantity: HKQuantity(unit: mmHg, doubleValue: diastolic), start: date, end: date)
      self.save([HKCorrelation(type: self.bp, start: date, end: date, objects: [s, d], metadata: Self.meta(id))], promise)
    }

    // Weights since `since` (ms), oldest first, from every source except Magno: { id, kg, at, source }[]
    AsyncFunction("readWeights") { (since: Double, promise: Promise) in
      let q = HKSampleQuery(sampleType: self.mass, predicate: Self.after(since), limit: 2000, sortDescriptors: [Self.oldestFirst]) { _, found, error in
        if let error { return promise.reject("ERR_HEALTH_READ", error.localizedDescription) }
        promise.resolve((found as? [HKQuantitySample] ?? []).filter(Self.notMagno).map {
          ["id": $0.uuid.uuidString, "kg": $0.quantity.doubleValue(for: .gramUnit(with: .kilo)), "at": $0.startDate.timeIntervalSince1970 * 1000, "source": $0.sourceRevision.source.name]
        })
      }
      self.store.execute(q)
    }

    // Blood pressure readings since `since` (ms), oldest first, from every source except Magno
    AsyncFunction("readBloodPressure") { (since: Double, promise: Promise) in
      let q = HKCorrelationQuery(type: self.bp, predicate: Self.after(since), samplePredicates: nil) { _, found, error in
        if let error { return promise.reject("ERR_HEALTH_READ", error.localizedDescription) }
        let mmHg = HKUnit.millimeterOfMercury()
        let rows: [[String: Any]] = (found ?? []).filter(Self.notMagno).compactMap { c in
          guard let s = c.objects(for: self.sys).first as? HKQuantitySample, let d = c.objects(for: self.dia).first as? HKQuantitySample else { return nil }
          return ["id": c.uuid.uuidString, "systolic": s.quantity.doubleValue(for: mmHg), "diastolic": d.quantity.doubleValue(for: mmHg), "at": c.startDate.timeIntervalSince1970 * 1000, "source": c.sourceRevision.source.name]
        }
        promise.resolve(rows.sorted { ($0["at"] as! Double) < ($1["at"] as! Double) })
      }
      self.store.execute(q)
    }
  }

  func save(_ objects: [HKObject], _ promise: Promise) {
    store.save(objects) { ok, error in
      if let error { return promise.reject("ERR_HEALTH_WRITE", error.localizedDescription) }
      promise.resolve(ok)
    }
  }

  static func meta(_ id: String) -> [String: Any] { [HKMetadataKeySyncIdentifier: "magno:\(id)", HKMetadataKeySyncVersion: 1] }
  static func after(_ ms: Double) -> NSPredicate { HKQuery.predicateForSamples(withStart: Date(timeIntervalSince1970: ms / 1000), end: nil) }
  static let oldestFirst = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
  static func notMagno(_ s: HKSample) -> Bool { s.sourceRevision.source.bundleIdentifier != Bundle.main.bundleIdentifier }
}
