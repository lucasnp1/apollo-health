Pod::Spec.new do |s|
  s.name           = 'LabReader'
  s.version        = '1.0.0'
  s.summary        = "Magno's lab report reader: PDF text with PDFKit, scans and photos with Vision, on the device"
  s.description    = "Magno's lab report reader: PDF text with PDFKit, scans and photos with Vision, on the device"
  s.license        = 'MIT'
  s.author         = 'Magno'
  s.homepage       = 'https://magno.fit'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'PDFKit', 'Vision'

  s.source_files = '**/*.swift'
end
