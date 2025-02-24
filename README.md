[![npm](https://img.shields.io/npm/v/mkpr.svg)](https://www.npmjs.com/package/mkpr)
[![License](https://img.shields.io/badge/License-0BSD-blue.svg)](https://spdx.org/licenses/0BSD.html)
[![bundlejs](https://deno.bundlejs.com/?q=mkpr\&badge=detailed)](https://bundlejs.com/?q=mkpr)
[![downloads](http://img.shields.io/npm/dm/mkpr.svg?style=flat-square)](https://npmjs.org/package/mkpr)
[![GitHub Issues](https://img.shields.io/github/issues/arlac77/mkpr.svg?style=flat-square)](https://github.com/arlac77/mkpr/issues)
[![Build Status](https://img.shields.io/endpoint.svg?url=https%3A%2F%2Factions-badge.atrox.dev%2Farlac77%2Fmkpr%2Fbadge\&style=flat)](https://actions-badge.atrox.dev/arlac77/mkpr/goto)
[![Styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![Known Vulnerabilities](https://snyk.io/test/github/arlac77/mkpr/badge.svg)](https://snyk.io/test/github/arlac77/mkpr)
[![Coverage Status](https://coveralls.io/repos/arlac77/mkpr/badge.svg)](https://coveralls.io/github/arlac77/mkpr)

## mkpr

create pull request by streaming content through a filter

Currently supports github and bitbucket hosted repositories.

% separates executable args from branch list

```shell
export AGGREGATION_FACTORY="github-repository-provider" # for github repos
export GITHUB_TOKEN='token providing repositroy write access' # for github repos

mkpr --entries '**/*.json' sed s/a/b/ % myGithubUser/myRepo
```

Create pull request for all package.json entries in the myuser/\_ config \_ repos of github
with the devDependency/config-expander set to ^10.3.2

```shell
export AGGREGATION_FACTORY="github-repository-provider" # for github repos
export GITHUB_TOKEN='token providing repositroy write access' # for github repos

mkpr --entries package.json --jsonpatch '[{"op":"replace","path":"/devDependencies/config-expander","value":"^10.3.2"}]' 'myuser/*config*'
```

# API

<!-- Generated by documentation.js. Update this documentation by updating the source code. -->

## Table of Contents

# install

```shell
npm install -g mkpr
```

# license

BSD-2-Clause
