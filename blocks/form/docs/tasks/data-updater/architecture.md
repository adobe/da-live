# Architecture: Data Updater

```mermaid
classDiagram
  direction LR

  class DaForm {
    +details
    -formModel
    -_schemas
    +handleModelIntent(Event)
    +render()
  }

  class FormModel {
    -_json
    -_schema
    -_annotated
    +validate()
    +get json()
    +get schema()
    +get annotated()
    +static fromJson(json, schemas)
  }

  class AnnotatedNode {
    +key
    +pointer
    +data
    +schema
  }

  class JSONPointer <<library>> {
    +get(document, pointer)
    +set(document, pointer, value)
    +encode(token)
    +decode(token)
  }

  class Updater <<module>> {
    +applyOp(json, op)
  }

  class EditorView <<web component>> {
    +formModel
    +emitIntent(op)
  }

  class SidebarView <<web component>> {
    +formModel
    +emitIntent(op)
  }

  DaForm --> FormModel : creates/reassigns
  DaForm --> Updater : uses applyOp
  Updater ..> JSONPointer : uses
  FormModel --> AnnotatedNode : builds tree (with pointer)
  EditorView --> FormModel : reads annotated nodes
  SidebarView --> FormModel : reads annotated nodes
  EditorView ..> DaForm : CustomEvent form-model-intent
  SidebarView ..> DaForm : CustomEvent form-model-intent
```

