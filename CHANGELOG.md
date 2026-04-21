# Changelog

## [2.3.0](https://github.com/ubiquity-os-marketplace/daemon-merging/compare/v2.2.0...v2.3.0) (2026-04-21)


### Features

* migrate issue tracking from Deno KV to Postgres ([50bf6d8](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/50bf6d8fee0af852f81141141387234828b6d384))
* migrate issue tracking store to postgres ([b6d9a4d](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/b6d9a4d424f993a12762d2defb7df62d6e07ef59))


### Bug Fixes

* add json import attributes for deno ([72d91f0](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/72d91f006c7e3d015bd98eee65a8b925b5c9a6a2))
* address non-transitive CI failures ([68c95bc](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/68c95bc1c6684a0e41a261e5c0d20a1f03c476cc))
* address postgres review feedback and ci ([67c6b54](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/67c6b54758a24a35f79ef4385ab3b549feb38f3f))
* align deno runtime env handling ([5a97019](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/5a970199fe4bbbcf9d674ed6c39f1b0dfe6f018d))
* bump plugin-sdk for runtime manifest refs ([ca359f4](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/ca359f48af12bf6f1de1549099b00fcb6ed5b534))
* cast runtime log level ([9fc60c4](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/9fc60c467721baab7a7a668edac72a8148d8e4a2))
* **ci:** gate deno db provisioning ([cc7f5d4](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/cc7f5d41dedf45ad0887ec6fb66db79cbe6dbc02))
* fall back to legacy deno token ([c01227c](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/c01227c2d836703a60ef985276d8e1cac30caa99))
* format vscode launch config ([3bb8d74](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/3bb8d74ecfec73355cc1bfa438e92b766a5f5ced))
* narrow branch-aware manifest plugin type ([2050612](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/20506124899ee9251a155952509195067e83313b))
* use deno 2 deploy token ([37fd1a4](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/37fd1a46d4ff9816dc70097b76a769332f91131f))
* widen runtime env typing ([c5c99e4](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/c5c99e4ac7077b761412f20919fac43934d93674))

## 2.2.0 (2026-03-23)


### Features

* add auto-merge workflow for development ([142510d](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/142510d7584bdd7d2c51dd1cdd0d3572447bdefc))
* Add comprehensive tests for CLI, GitHub API, guards, and utility functions ([a6032ec](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/a6032ecee92221add2cdccc8c7a5cc1699b5a5a7))
* add getMainBranch function and improve main branch creation logic ([305f631](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/305f631fb10bf4de1bece5b01c15d03a5f9d9c4d))
* add support for "issues.reopened" event handling ([9301712](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/93017126f3b367d63fdcdf6f74ec687a18b4a81c))
* enhance processRepository to skip merging if main branch matches default branch and update mock handlers for GitHub API ([aa7e41b](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/aa7e41bd22b235d850ea77fd30c9c26bcd214719))
* implement auto-merge functionality for development branches ([558491f](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/558491f438ac8c73483e1c54ff08d27eb8071192))
* implement branch inactivity check and merging logic, including new processing and merging modules ([87988a1](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/87988a12672967404a6e722f560ccce6d52692e0))


### Bug Fixes

* accept kernelPublicKey input ([13d1671](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/13d1671f4e095f09ef6d686aa406033deb0b47f3))
* adjust error handling in CLI to treat specific pull request errors as warnings and update processing return structure for skipped repositories ([49fc9c0](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/49fc9c07d30e21659f29a9fbd83258176e5bd931))
* bumped SDK version ([c389dfe](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/c389dfe6bdbf7227d662e288c256f413935564b6))
* bumped SDK version ([c732470](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/c73247082890d0136f76a0354b7477423ca96ae0))
* **ci:** align artifact deploy workflow defaults ([7987fe7](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/7987fe7486ca5d3cd11ab2e4f91823d002faea9e))
* **ci:** setup deno before install-time manifest generation ([f65dfeb](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/f65dfebc9be315dce8a5a73a09db33a451c50642))
* **ci:** use artifact branch deploy actions ([4666b30](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/4666b3022a3c87369115a08d19235f3328be8e29))
* generate manifest on install for tests and deploy ([927daa0](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/927daa064636405eb8b1b943fe4ef156ea3d131b))
* inline manifest prepare and target deploy action main ([b5dd802](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/b5dd802a3c67959819dc957202ec9b2ff509eb8f))
* introduced KV adapters for handling database operations ([0273e62](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/0273e62f73b653b966e638f3a877219d4e802920))
* **knip:** use bunx for manifest prepare script ([5188a49](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/5188a49c96afa49cc96ec438c5843313d0b076e1))
* **manifest:** derive short_name from CI repository context ([296d92e](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/296d92e70011feab1452c44389314ec53a8ff27a))
* pin manifest workflow to issue-27 deploy action ([c3647ee](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/c3647ee3b8144c738f081432be0a7ad0d7dac20b))
* **prepare:** use published manifest tool dist-tag ([95430ce](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/95430ce2e2f68d0ca6972b656c58a96a8c0a8770))
* process cron updates directly ([7634cd2](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/7634cd2a8acd02bc4dac8e4b9c3e822e75858c44))
* process cron updates directly ([cc66f57](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/cc66f57b195e6eba1a842098227895bf54c03fca))
* refine Jest configuration ([142510d](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/142510d7584bdd7d2c51dd1cdd0d3572447bdefc))
* release please issue permission ([416d28e](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/416d28e6178c1b2a8f942f17ec870106e25a1ed1))
* resolve cron manifest lookups against dist mirror branches ([#75](https://github.com/ubiquity-os-marketplace/daemon-merging/issues/75)) ([6edcd10](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/6edcd10f7936afb3ead3f2da04e7985cf46836cc))
* set deploy action ref to [@main](https://github.com/main) ([b995319](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/b995319bfb439dd5cf05ee80f689b89751889acf))
* sync manifest workflow metadata for issue 27 ([1826a66](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/1826a66fa2df0e09f93e6b9a8bd846e02b5a6c3e))
* sync workflow skipBotEvents and parameter metadata ([8e53722](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/8e537221060f3887d8780f4bc1ab3b5dc1bbf8e9))
* the App ID and the App private key are properly used on authentication ([50fae48](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/50fae483505665dde33702d3d6e5f216124714a8))
* the octokit instanced used for the workflow management is from the target repo ([2301d4f](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/2301d4f6b7dce669ab30074c9e82297b513ef78e))
* use custom octokit for cron ([bda0c9f](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/bda0c9f5ffae2f3e8df74c32052d546decd7fd58))
* workflow enable / disable with proper credentials ([7bb6a84](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/7bb6a84d61c16b705eed0c551c4e43d49eebbf58))
* **workflows:** pin deploy action ref and source branch input ([2e0fb1a](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/2e0fb1a231dcb86831e04c776f5c5620ae3aa847))
* **workflows:** use artifact deploy action branch for dist publish ([901a47a](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/901a47af25e867ad872ee489d8d7f29c69eb3a7e))


### Miscellaneous Chores

* release 2.2.0 ([aa5dd54](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/aa5dd542791f6f4dd043a03e37e221dc9542419e))

## [2.0.1](https://github.com/ubiquity-os-marketplace/daemon-merging/compare/v2.0.0...v2.0.1) (2025-01-22)


### Bug Fixes

* bumped SDK and added bot event skip in manifest.json ([5a77cc5](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/5a77cc53c61062a83bf979b05c2b71d05e5ffba4))

## [2.0.0](https://github.com/ubiquity-os-marketplace/daemon-merging/compare/v1.2.0...v2.0.0) (2024-12-16)


### ⚠ BREAKING CHANGES

* removed database and scrap GitHub organizations and repos
* changed configuration to take a repo list

### Features

* added configuration generation script ([910811d](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/910811df63ae916b2539eb016f87ed5694f57a27))
* added schema validation workflow ([447f421](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/447f4215c8fffeb07e86f6c025f649ec1feb30e0))
* added summary ([125f313](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/125f31304bf94a1928f05490d48e5fb1dc0bf66e))
* changed configuration for repo watch ([58182e6](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/58182e6b27fe286f29e63683855ee632c088dca9))
* changed configuration to take a repo list ([4cba61c](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/4cba61c4351f4d61d1c7daf6cdb37b8594f42428))
* database update step ([5bad80a](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/5bad80a8049890dcf16a5661caadfdacc89fdf2b))
* formatting checks ([4ee151c](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/4ee151ca05e8c6af064b90aaacaf5785b68600df))
* removed database and scrap GitHub organizations and repos ([cba2f9f](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/cba2f9f575551e7191b09b36207d771e6b2100ca))
* SDK and command interface ([ab95741](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/ab95741fbce345e71e801eeadfabedf3a0a222ec))
* set db to be sqlite ([2dbe73b](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/2dbe73be10f9ae436050f6b3626890db847c166c))


### Bug Fixes

* add environment ([2fbe7b1](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/2fbe7b1aec710cc17239b6137bbc8e62e49655e6))
* changed approval requirement check to use the configuration ([e1f50e9](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/e1f50e95576f81ce01196bbdc0890b0617bf23df))
* changed summary output ([dc847c1](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/dc847c1699c40f3f44a7b8482435d5fd9e838844))
* **config:** add descriptions to JSON schema properties ([69c1ced](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/69c1cedb036442a86ebf774ec7e6b865c3728186))
* console log ([43f30d4](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/43f30d4de3bdc2c0e0ab571936faa3cca260a0c7))
* contributor's pull-requests do not get merged automatically ([b71ef15](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/b71ef15eb2fff662f83bf264b052d7f300bd6c46))
* cross-env ([e8c7724](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/e8c7724b23bc2763f1f8bbb5b9aa91cf1bfd5078))
* cross-env ([b27aad9](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/b27aad93fd6f4f55287f7247c9fee68524c10d6e))
* default org is not handled at pull-request check stage ([0980040](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/09800408ff6c07e50e001ebf8b5f45988a6cc0eb))
* filter reviews by approved author_association ([286f1b1](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/286f1b1fcc7da02a50f6c0caf1854870eee0f36d))
* fixed event manifest.json ([082bddd](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/082bddd7a8f3278d343c102b1fcdd7269ce5a91d))
* fixed imports within main ([bb001cf](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/bb001cf3204593a79b2d214941940a9a44675c00))
* formatting and deploy ([bd2f03e](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/bd2f03e829444555800b3c26c6708ef22e569db2))
* knip ([14ad597](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/14ad597fbe8444a640d7472bd2f0a4be94cff10c))
* manifest name ([a2b901c](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/a2b901c5fa6da976bc117f36406b212e827fe91b))
* removed space in additional org in query search ([df70e07](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/df70e0794787cda05554a157c3d73999a0df11fc))
* set repo target to null if none is provided ([6b5cfbf](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/6b5cfbfc406ea581c5790b705631ad3bdbbb20a7))
* setting default owner when monitor is empty ([c451dfa](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/c451dfa1a87deb4130262f5c8efbac86ca5eddfb))

## [1.1.0](https://github.com/ubiquity-os-marketplace/daemon-merging/compare/v1.0.1...v1.1.0) (2024-10-21)


### Features

* added configuration generation script ([910811d](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/910811df63ae916b2539eb016f87ed5694f57a27))
* added schema validation workflow ([447f421](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/447f4215c8fffeb07e86f6c025f649ec1feb30e0))


### Bug Fixes

* filter reviews by approved author_association ([286f1b1](https://github.com/ubiquity-os-marketplace/daemon-merging/commit/286f1b1fcc7da02a50f6c0caf1854870eee0f36d))

## [1.0.1](https://github.com/ubiquibot/automated-merging/compare/v1.0.0...v1.0.1) (2024-08-20)


### Bug Fixes

* fixed event manifest.json ([082bddd](https://github.com/ubiquibot/automated-merging/commit/082bddd7a8f3278d343c102b1fcdd7269ce5a91d))

## 1.0.0 (2024-07-29)

### Features

- database update step ([5bad80a](https://github.com/ubiquibot/automated-merging/commit/5bad80a8049890dcf16a5661caadfdacc89fdf2b))
- set db to be sqlite ([2dbe73b](https://github.com/ubiquibot/automated-merging/commit/2dbe73be10f9ae436050f6b3626890db847c166c))

### Bug Fixes

- changed approval requirement check to use the configuration ([e1f50e9](https://github.com/ubiquibot/automated-merging/commit/e1f50e95576f81ce01196bbdc0890b0617bf23df))
- fixed imports within main ([bb001cf](https://github.com/ubiquibot/automated-merging/commit/bb001cf3204593a79b2d214941940a9a44675c00))
