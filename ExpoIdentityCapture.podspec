require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'ExpoIdentityCapture'
  s.version      = package['version']
  s.summary      = package['description']
  s.homepage     = package['homepage']
  s.license      = package['license']
  s.authors      = package['author']

  s.platforms    = { :ios => '15.1' }
  s.source       = { :git => package['repository']['url'], :tag => "v#{s.version}" }

  # Face pose detection for the selfie liveness check (Apple Vision, part of iOS)
  s.source_files = ['ios/**/*.{swift,m,mm}']
  s.frameworks   = ['Vision', 'CoreMedia', 'ImageIO']

  load 'nitrogen/generated/ios/ExpoIdentityCapture+autolinking.rb'
  add_nitrogen_files(s)

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  s.dependency 'VisionCamera'
  install_modules_dependencies(s)
end
