#!/usr/bin/env node
/*
 * Copyright 2026 Adobe. All rights reserved.
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * Catalog parity check for DA-live i18n.
 *
 * Compares each non-default locale catalog against the default (en).
 * Flags:
 *   - Keys present in en but missing from a locale.
 *   - Keys present in a locale but not in en (likely typos or stale).
 *   - Plural shape mismatches (string in en, object in locale, or vice-versa).
 *   - Missing required plural branches (relative to the default catalog).
 *   - Unbalanced interpolation tokens (e.g. {name} in en but absent in locale).
 *
 * Exits non-zero on any issue so it can be wired into CI / lint.
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(HERE, '..', 'locales');
const DEFAULT_LOCALE = 'en';

async function loadCatalog(locale) {
  const raw = await readFile(join(LOCALES_DIR, `${locale}.json`), 'utf8');
  return JSON.parse(raw);
}

function tokensIn(template) {
  if (typeof template !== 'string') return new Set();
  const out = new Set();
  template.replace(/\{(\w+)\}/g, (_, name) => {
    out.add(name);
    return _;
  });
  return out;
}

function setDifference(a, b) {
  return [...a].filter((x) => !b.has(x));
}

function compareTokens(enTpl, locTpl) {
  const en = tokensIn(enTpl);
  const loc = tokensIn(locTpl);
  return {
    missing: setDifference(en, loc),
    extra: setDifference(loc, en),
  };
}

function compareEntry(key, enEntry, locEntry, issues, locale) {
  const enType = typeof enEntry;
  const locType = typeof locEntry;

  if (enType !== locType) {
    issues.push(`[${locale}] ${key}: shape mismatch (en=${enType}, ${locale}=${locType})`);
    return;
  }

  if (enType === 'string') {
    const { missing, extra } = compareTokens(enEntry, locEntry);
    if (missing.length) issues.push(`[${locale}] ${key}: missing tokens ${missing.map((t) => `{${t}}`).join(', ')}`);
    if (extra.length) issues.push(`[${locale}] ${key}: unexpected tokens ${extra.map((t) => `{${t}}`).join(', ')}`);
    return;
  }

  if (enType === 'object' && enEntry !== null) {
    const enBranches = Object.keys(enEntry);
    const locBranches = Object.keys(locEntry || {});
    const missingBranches = setDifference(new Set(enBranches), new Set(locBranches));
    if (missingBranches.length) {
      issues.push(`[${locale}] ${key}: missing plural branches ${missingBranches.join(', ')}`);
    }
    enBranches.forEach((branch) => {
      if (!Object.prototype.hasOwnProperty.call(locEntry, branch)) return;
      const { missing, extra } = compareTokens(enEntry[branch], locEntry[branch]);
      if (missing.length) issues.push(`[${locale}] ${key}.${branch}: missing tokens ${missing.map((t) => `{${t}}`).join(', ')}`);
      if (extra.length) issues.push(`[${locale}] ${key}.${branch}: unexpected tokens ${extra.map((t) => `{${t}}`).join(', ')}`);
    });
  }
}

async function main() {
  const files = (await readdir(LOCALES_DIR)).filter((f) => f.endsWith('.json'));
  const locales = files.map((f) => f.replace(/\.json$/, ''));
  if (!locales.includes(DEFAULT_LOCALE)) {
    process.stderr.write(`Default locale ${DEFAULT_LOCALE}.json not found in ${LOCALES_DIR}\n`);
    process.exit(2);
  }

  const en = await loadCatalog(DEFAULT_LOCALE);
  const enKeys = Object.keys(en);
  const issues = [];

  const otherLocales = locales.filter((l) => l !== DEFAULT_LOCALE);
  const catalogs = await Promise.all(otherLocales.map((l) => loadCatalog(l)));

  otherLocales.forEach((locale, idx) => {
    const cat = catalogs[idx];
    const catKeys = new Set(Object.keys(cat));

    enKeys.forEach((key) => {
      if (!catKeys.has(key)) {
        issues.push(`[${locale}] ${key}: missing translation`);
        return;
      }
      compareEntry(key, en[key], cat[key], issues, locale);
    });

    Object.keys(cat).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(en, key)) {
        issues.push(`[${locale}] ${key}: not present in ${DEFAULT_LOCALE} (orphan)`);
      }
    });
  });

  if (issues.length) {
    process.stderr.write(`Catalog parity issues (${issues.length}):\n`);
    issues.forEach((i) => process.stderr.write(`  ${i}\n`));
    process.exit(1);
  }

  process.stdout.write(`Catalog parity OK across ${locales.length} locales (${enKeys.length} keys).\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exit(2);
});
