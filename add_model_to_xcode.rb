#!/usr/bin/env ruby

require 'xcodeproj'

project_path = 'ios/Matalk.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Get the main target
target = project.targets.first

# Get the main group
main_group = project.main_group['Matalk'] || project.main_group

# Add the model file if it doesn't exist at root level
model_file = 'ios/hey_verbi_v1.onnx'
file_ref = main_group.files.find { |f| f.path == 'hey_verbi_v1.onnx' }

if file_ref.nil?
  puts "Adding hey_verbi_v1.onnx to Xcode project..."
  file_ref = main_group.new_reference('hey_verbi_v1.onnx')
  
  # Add to resources build phase
  resources_phase = target.resources_build_phase
  build_file = resources_phase.add_file_reference(file_ref)
  
  puts "✅ Added hey_verbi_v1.onnx to project"
  project.save
  puts "✅ Project saved"
else
  puts "ℹ️  hey_verbi_v1.onnx already exists in project"
end
