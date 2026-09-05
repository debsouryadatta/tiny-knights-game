import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',use:{viewport:{width:1440,height:1000},headless:true},reporter:'list'});
