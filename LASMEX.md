<p align="center"><img src="assets/lasmex-full.png" alt="LasmeX — AGENTIC SYSTEMS. CLEAN CODE." width="460"></p>

# LasmeX

Français | [English](README.md) | [中文](README.zh.md)

LasmeX est un harness agentique open source, francophone par défaut et maintenu dans le dépôt public [lasme-ephrem/LasmeX](https://github.com/lasme-ephrem/LasmeX). Ce fork indépendant de [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) conserve l’architecture Cordis où chaque capacité est un plugin, tout en possédant sa propre identité, ses choix de produit et sa distribution.

## Ce que livre LasmeX

- **LasmeX Code par défaut** : un agent de développement en français, Code Mode, outils de fichiers, shell, Web, LSP, tâches et sous-agents.
- **Tableau Mission** : objectif, étapes, permissions, vérifications, capacités mobilisées, consommation de jetons, approbations, blocages et enfants orchestrés, sans exposer de raisonnement interne.
- **Contrôle utilisateur** : préréglages de permissions lisibles, confirmation renforcée pour l’accès complet et mutations mémoire soumises à approbation dans les profils interactifs.
- **Mémoire durable par projet** : mémoires explicites, bornées et épinglables, isolées selon l’espace de travail, sans extraction automatique des conversations.
- **Reprise et orchestration** : sessions persistantes, reprise après redémarrage, sous-agents contrôlables et suivi des tâches de fond.
- **Expérience française** : interface Web, aide CLI, messages principaux, guides utilisateur, documentation de développement et références techniques en français, avec anglais et chinois disponibles.
- **Plusieurs surfaces** : application Web locale, application desktop Windows, macOS et Linux, profil headless, serveur ACP et protocole JSON-RPC.
- **SDK indépendants** : client TypeScript LasmeX et package Python `lasmex-sdk`, avec runtime natif distribué séparément selon la plateforme.

## Principes

- **Local et contrôlable** : les données utilisateur résident par défaut dans `~/.lasmex`, la télémétrie héritée est désactivée et toute collecte future devra être explicite, documentée et consentie.
- **Tout est extensible** : modèles, outils, compétences, mémoire, boucles, interfaces et orchestrateurs évoluent par plugins et capacités complètes.
- **Observable sans surveillance intrusive** : les faits d’exécution sont durables et vérifiables ; les raisonnements privés ne sont ni extraits ni affichés.
- **Permissions avant mutation** : les opérations sensibles annoncent leur portée et suivent la politique choisie par l’utilisateur.
- **Attribution honnête** : DeepSeek reste nommé comme projet amont ou fournisseur lorsqu’il l’est réellement, jamais comme identité du produit LasmeX.

## Démarrer depuis les sources

Installez Node.js 22.19 ou plus récent et pnpm, puis exécutez :

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm lasmex web
```

L’interface Web écoute par défaut sur `http://127.0.0.1:3080`. `LASMEX_HOME` permet de choisir un autre répertoire de données utilisateur. Le [guide de démarrage](docs/user/guide/index.fr.md), la [configuration des fournisseurs](docs/user/guide/providers.fr.md) et le [SDK Python](docs/user/guide/python-sdk.fr.md) détaillent les parcours principaux.

## Application desktop

`pnpm desktop:package` construit l’application portable pour le système courant. Les commandes `pnpm desktop:make:windows`, `pnpm desktop:make:macos` et `pnpm desktop:make:linux` produisent respectivement un installateur Squirrel, une application macOS compressée et une archive Linux. Chaque artefact natif est construit sur son système cible. Les builds locaux non signés désactivent les mises à jour automatiques ; une release signée exige une origine HTTPS et les identités de signature de la plateforme.

## Garanties et limites

La mémoire ne déduit jamais automatiquement des faits depuis une conversation : l’utilisateur ou l’agent doit les enregistrer explicitement. Le tableau Mission présente des faits d’exécution durables, pas une preuve sémantique de qualité ni une chaîne de pensée. Les coûts monétaires ne sont pas affichés tant qu’aucune projection tarifaire fiable n’existe. Les identifiants `DSH_*` encore conservés servent uniquement aux mécanismes internes de build, de test ou de protocole ; la configuration publique utilise LasmeX.

LasmeX conserve la licence MIT et les avis tiers du projet amont. Le remote Git `origin` pointe vers `lasme-ephrem/LasmeX` ; `upstream` suit `deepseek-ai/deepseek-harness` pour l’attribution et les synchronisations explicites.

## Tableau de livraison (état au 14 août 2026)

### Ce qui est déjà livré

| Domaine | Livrable | Niveau de livraison | Vérifications déjà faites | Limites restantes |
|---|---|---|---|---|
| Produit / marque | Fork LasmeX avec identité propre (CLI, UI, docs, badges, website, agents-notes publiques) | **OK** | Vérifications par diff + tests d’identité ciblés sur CLI/ACP/SDK | Quelques références DeepSeek restent légitimes quand il s’agit du fournisseur amont |
| CLI / profils | `lasmex` fonctionnel (`web`, `headless`, `plugin`), argumentation FR (`--profile`, `--help`, `--patch`), boot propre des profils | **OK** | `node --import tsx/esm apps/cli/src/bin.ts --help`; tests CLI snapshot, identity et smoke manuels | Pas d’interface REPL style shell interactif en permanence (ce n’est pas le mode par design) |
| Exécution de tâches | one-shot par profil headless + sortie de résultat stable | **OK** | `apps/cli/tests/identity.spec.ts`, `apps/cli/tests/context-before-prompt.snapshot.ts`, `apps/cli/tests/lasmex-code.snapshot.ts` (lot), tests keyless e2e | Pas de mode “chat REPL” dédié |
| UI Web | Code Mode, session Mission, tableau Mission complet, sous-agents visibles, approbations, permissions, projections de travail | **OK** | `apps/web/tests/mission-dashboard.e2e.ts`, `pnpm exec vitest run ...` ciblé, `pnpm run test:gui` | Aucun bug bloquant connu signalé, mais expérience finalisée à valider en QA manuelle |
| Infrastructure plugin | Nouveaux modules host/session/plugins essentiels : session-mission, ui-mission, memory, skill badge, subagent LasmeX, etc. | **OK** | suites ciblées package + `tsdown`/build + verifications de catalog | Beaucoup d’ajouts portent encore un historique de migration partagé avec le lot précédent |
| Python SDK / runtime | `lasmex-sdk`, `lasmex-runtime-bin` et runtime natif renommés et alignés | **OK** | `python -m pytest` ciblé, tests runtime, snapshot/keyless dédiés | Build/install de l’exécutable Windows/macOS/Linux selon plateforme à valider en release |
| Desktop | App portable Windows/macos/linux + smoke d’installation Windows, traces de packaging | **Partiel** | build local, package portable, tests desktop ciblés, smoke windows portable | Release signée/macOS notarisation/auto-update en attente d’identité de signing réelle |
| i18n produit | FR-first côté shell, UI client et guides principaux | **Partiel** | `pnpm exec vitest ... french-surface.client.spec.ts`; `docs:check` + projection FR contrôlées | Toutes les références FR ne sont pas encore 100% complètes ; certains parcours docs restent en fallback |

### Ce qui reste à faire pour “produit final”

| Domaine | Reste précis | Tests requis avant closure |
|---|---|---|
| Docs FR | Finaliser l’admission et la revue de toutes les pages FR restantes (notamment doc technique/cookbooks non encore stables), puis stabiliser la passe de publication docs | `pnpm run doc-sync`, `pnpm run docs:check`, `pnpm run verify-french-docs` |
| Desktop release | finaliser chaîne de release locale et signée par plateforme (Windows Squirrel, macOS App notarized, Linux tarball) + checks de publication | `pnpm desktop:package`, `pnpm desktop:make:windows`, `pnpm desktop:make:macos`, `pnpm desktop:make:linux`, smoke install sur OS cible |
| Distribution | finaliser la boîte de publication finale avec credentials (npm/PyPI/CodeQL/attestations) | `pnpm run release` (ou équivalent interne), vérifications release gates dédiées |
| Validation métier finale | suite recette “utilisateur” : créer/sessionner un projet, lancer tache, permission mutation mémoire, sous-agents, approbations, reprise de session, historique, traduction FR | Test manuel + 1 run smoke: `lasmex web`, `lasmex --profile headless "..."`, script de base de smoke web |
| Contrôle qualité produit | stabiliser les derniers écarts de portée (pas de feature manquante, pas d’échec de gating bloquant) | `pnpm run build`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run check:windows-wine` (si échec Windows répété), `pnpm run test:coverage` selon fenêtre release |

## Jalons de livraison proposés

| Jalon | Cible | Condition de passage |
|---|---|---|
| MVP local utilisable | Démarrer Web + headless + Mission + français de base | `pnpm run build`, start + smoke cli/web, e2e Mission + smoke desktop portable |
| Version bêta produit | Documentation française cohérente + release desktop locale + tests de régression ciblés | `pnpm run doc-sync`, `pnpm run docs:check`, `pnpm run desktop:make:*`, tests ciblés ciblés de chaque lot |
| Version 1.0 prête | Publish gates complets + release publish dry-run + recette utilisateur validée | Gates release + validation manuelle de 8 scénarios métier + passage sans régression des tests finaux |

## Checklist finale vers 1.0 (à cocher dans l’ordre)

### Étape 1 — Blocage du socle

- [x] **1.1** Vérifier la base de lancement locale
  - [x] Node.js 22.19+ disponible, `corepack pnpm --version` OK
  - [x] `corepack pnpm --version` retourne une version stable (11.7.0 attendue)
  - [x] `pnpm install --frozen-lockfile` OK sans erreur
  - [x] `pnpm run build` OK
  - [x] `node --import tsx/esm apps/cli/src/bin.ts --help` s’affiche correctement

- [x] **1.2** Vérifier les expériences cœur (débloquer la valeur produit)
  - [x] `LASMEX_HOME=<dossier-test> node --import tsx/esm apps/cli/src/bin.ts web --port 3080` démarre la Web
  - [x] `LASMEX_HOME=<dossier-test> pnpm lasmex --profile headless "ping"` renvoie une réponse 0
  - [x] Les deux commandes précédentes sont répétables 2 fois de suite (idempotence)
  - [x] `pnpm run lint` + `pnpm run typecheck` passent

### Étape 2 — UI/UX mission + fonctionnalités différenciantes

- [x] **2.1** Valider le tableau Mission en conditions réelles
  - [x] Démarrage d’une tâche via Web puis enregistrement d’une action (ex: `memory`, `goal`, `permissions`, `todo`)
  - [x] Vue Mission visible et lisible avec : objectif / étapes / permissions / vérifications / approbations / enfants
  - [x] `apps/web/tests/mission-dashboard.e2e.ts` vert
  - [x] Pas d’affichage de détails de raisonnement interne dans la vue Mission

- [x] **2.2** Finaliser les garde-fous multi-agents
  - [x] Workflow de sous-agents (lancement, monitoring, reprise) validé sur un cas simple
  - [x] Approvals : refus / autorisation / interruption gérés visuellement
  - [x] Reprise de session après redémarrage testée

### Étape 3 — Produit et distribution (pré-1.0)

- [ ] **3.1** Finaliser la couverture FR et la publication docs
  - [ ] `pnpm run doc-sync` vert
  - [ ] `pnpm run docs:check` vert
  - [ ] `pnpm run verify-french-docs` vert
  - [ ] Site projeté en FR avec mapping finalisé (pages stables)

- [ ] **3.2** Finaliser la distribution desktop
  - [x] `pnpm desktop:package` OK
  - [x] `pnpm desktop:make:windows` OK + installation locale lancée
  - [ ] `pnpm desktop:make:linux` OK
  - [ ] `pnpm desktop:make:macos` OK (ou justification de blocage/plan de report)
  - [ ] `pnpm run release/verify-distribution` (ou équivalent) validé

- [ ] **3.3** Finaliser la chaîne release et SDK/publication
  - [ ] Credentials CI/repository renseignés (npm, PyPI, attestations)
  - [ ] Gates de release ciblées passées
  - [ ] `lasmex` CLI, web et desktop publiables avec métadonnées cohérentes
  - [ ] `pnpm run build` + `pnpm run test` selon créneau de release

### Étape 4 — Rejet de blocage et validation 1.0

- [x] **4.1** Passer la recette utilisateur finale (8 cas minimum)
  - [x] Cas 1 : démarrage web + chat simple
  - [x] Cas 2 : tâche headless + sortie propre
  - [x] Cas 3 : édition de fichier via outil
  - [x] Cas 4 : activation permission sensible (lecture/écriture mémoire)
  - [x] Cas 5 : sous-agent déclenché + suivi
  - [x] Cas 6 : approbation + interruption + reprise
  - [x] Cas 7 : retour de session après redémarrage
  - [x] Cas 8 : bascule locale FR/EN visible

- [ ] **4.2** Signer “release candidate”
  - [ ] Toutes les cases de cette checklist sont cochées
  - [ ] Aucun ticket bloquant restant
  - [ ] Validation manuelle finale + publication de la version 1.0
