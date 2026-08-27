#!/usr/bin/env node
import { exec } from 'child_process';
import { execSync } from 'child_process';

console.log('Starting build process...');

try {
  // First run scripts to generate assets
  console.log('Running scripts...');
  execSync('node scripts/generate-icons.mjs', { stdio: 'inherit' });
  execSync('node scripts/generate-sw.mjs', { stdio: 'inherit' });
  
  // Then run next build
  console.log('Running next build...');
  execSync('next build', { stdio: 'inherit' });
  
  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}