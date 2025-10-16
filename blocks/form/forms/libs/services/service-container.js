/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { SchemaService } from './schema-service.js';
import { SchemaLoaderService } from './schema-loader-service.js';
import { LocalSchemaService } from './local-schema-service.js';
import { StorageService } from './storage-service.js';
import { DaService } from './da-service.js';
import { LabelService } from './label-service.js';
import { ValidationService } from './validation-service.js';
import { FormUiModelService } from './form-ui-model-service.js';
import { ConfigService } from './config-service.js';
import { AssetsService } from './assets-service/AssetsService.js';
import { AuthService } from './auth-service.js';
/**
 * ServiceContainer
 *
 * Central registry for app services with lazy initialization. Exposes getters
 * that instantiate services on first access and cache them for reuse.
 */
export class ServiceContainer {
  /**
   * Creates a new ServiceContainer instance
   * @param {object} context - The application context
   */
  constructor(context) {
    this._context = context;
    this._services = {};
  }

  get schema() {
    if (!this._services.schema) {
      this._services.schema = new SchemaService(this._context);
    }
    return this._services.schema;
  }

  get schemaLoader() {
    if (!this._services.schemaLoader) {
      this._services.schemaLoader = new SchemaLoaderService(this._context);
    }
    return this._services.schemaLoader;
  }

  get localSchema() {
    if (!this._services.localSchema) {
      this._services.localSchema = new LocalSchemaService(this._context);
    }
    return this._services.localSchema;
  }

  get storage() {
    if (!this._services.storage) {
      this._services.storage = new StorageService(this._context);
    }
    return this._services.storage;
  }

  get backend() {
    if (!this._services.backend) {
      this._services.backend = new DaService(this._context);
    }
    return this._services.backend;
  }

  get label() {
    if (!this._services.label) {
      this._services.label = new LabelService();
    }
    return this._services.label;
  }

  get validation() {
    if (!this._services.validation) {
      this._services.validation = new ValidationService();
    }
    return this._services.validation;
  }

  get formUiModel() {
    if (!this._services.formUiModel) {
      this._services.formUiModel = new FormUiModelService(this._context);
    }
    return this._services.formUiModel;
  }

  get config() {
    if (!this._services.config) {
      this._services.config = new ConfigService();
    }
    return this._services.config;
  }

  get assets() {
    if (!this._services.assets) {
      this._services.assets = new AssetsService(this._context);
    }
    return this._services.assets;
  }

  get auth() {
    if (!this._services.auth) {
      this._services.auth = new AuthService(this._context);
    }
    return this._services.auth;
  }

}
