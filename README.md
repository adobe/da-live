# Dark Alley

Dark Alley is a research project.

## Developing locally
### Run
1. Clone this repo to your computer.
1. Install the [AEM CLI](https://github.com/adobe/helix-cli): `sudo npm install -g @adobe/aem-cli`
1. In a terminal, run `aem up` this repo's folder.
1. Start building.

### Run w/ local API
If you have appropriate credentials, you can develop against a local `da-admin` API server.

1. Run `da-admin` locally. Details [here](https://github.com/adobe/da-admin).
1. Start the local AEM CLI (see above) 
1. Visit https://localhost:3000/?da-admin=local

**Note:** Using the query string will set a localStorage value and will not clear until you use `?da-admin=reset`.

## Additional details
### Recommendations
1. We recommend running `npm install` for linting.
