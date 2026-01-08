# Form Mock Schemas

This directory contains local test schemas for development and testing purposes.

## Usage

To load a local test schema, add the `localSchema` query parameter to your URL:

```
?localSchema=comprehensive-test
```

This will load the schema from `blocks/form/mocks/comprehensive-test.schema.json`.

## File Naming Convention

Local test schemas must follow the naming pattern:
```
{schema-name}.schema.json
```

For example:
- `comprehensive-test.schema.json` → use `?localSchema=comprehensive-test`
- `form-input.schema.json` → use `?localSchema=form-input`

## Example Schemas

### comprehensive-test.schema.json
A complete form schema for testing all data structures and field types:

**Basic Fields:**
- Full Name (text input, required)
- Email Address (email validation, required)
- Age (number with range 0-150)
- Subscribe to Newsletter (boolean checkbox)

**Simple Lists:**
- Interests (list of text items)
- Tags (list of numbers)

**Single Objects:**
- Address (street, city, ZIP code, country)
- Preferences (theme, notifications, language)
- Metadata (created date, author, tags)

**Lists of Items:**
- Emergency Contacts (name, phone, relationship)
- Work History (company, position, dates, responsibilities, location)

**Nested Lists:**
- Skill Categories (list of skill lists)
- Project Groups (list of project lists)

**Reusable Components:**
- Address (used in multiple places)
- Contact (for emergency contacts)
- Job (with location and responsibilities)
- Project (with status and priority)
- Author (for metadata)

## Creating Your Own Test Schema

1. Create a new file following the naming pattern: `{name}.schema.json`
2. Use valid JSON Schema draft 2020-12 format
3. Test it by accessing: `?localSchema={name}`

## Benefits

- **Fast iteration**: No need to deploy schemas to the server
- **Offline testing**: Test without network access
- **Version control**: Keep test schemas in git
- **Isolated testing**: Test schemas don't affect production data
