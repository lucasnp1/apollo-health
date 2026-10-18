Pod::Spec.new do |s|
  s.name           = 'MagnoHealth'
  s.version        = '1.0.0'
  s.summary        = "Magno's Apple Health bridge: weight and blood pressure, both ways"
  s.description    = "Magno's Apple Health bridge: weight and blood pressure, both ways"
  s.license        = 'MIT'
  s.author         = 'Magno'
  s.homepage       = 'https://magno.fit'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'HealthKit'
  s.source_files = '**/*.swift'
end
