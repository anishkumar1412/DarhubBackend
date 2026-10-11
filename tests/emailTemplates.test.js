import test from 'node:test';
import assert from 'node:assert/strict';
import { adminSetupEmailTemplate, otpEmailTemplate, adminPasswordResetEmailTemplate, escapeHtml } from '../services/emailTemplates.js';

test('names typed by an admin cannot inject HTML into the email', () => {
  const { html } = adminSetupEmailTemplate('<script>alert(1)</script>"><a href=evil>', 'https://admin.example.com/setup?token=abc', 24);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('"><a href=evil>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('non-http links are neutralised, http(s) links are kept', () => {
  assert.ok(adminPasswordResetEmailTemplate('A', 'javascript:alert(1)').html.includes('href="#"'));
  assert.ok(adminPasswordResetEmailTemplate('A', 'https://admin.example.com/reset?token=abc&x=1').html.includes('href="https://admin.example.com/reset?token=abc&amp;x=1"'));
});

test('the plain-text part carries the link and the expiry', () => {
  const { text } = adminSetupEmailTemplate('Asha', 'https://admin.example.com/setup?token=abc', 24);
  assert.ok(text.includes('https://admin.example.com/setup?token=abc'));
  assert.ok(text.includes('24 hours'));
  assert.ok(adminPasswordResetEmailTemplate('Asha', 'https://x.test/r', 1).text.includes('1 hour.'));
});

test('the OTP email states the real validity and shows the code in both parts', () => {
  const { html, text } = otpEmailTemplate('482913', 3);
  assert.ok(html.includes('482913') && text.includes('482913'));
  assert.ok(html.includes('3 minutes') && text.includes('3 minutes'));
});

test('escapeHtml handles null and quotes', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(`a&b"c'd`), 'a&amp;b&quot;c&#39;d');
});
