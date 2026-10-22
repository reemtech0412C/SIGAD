# 🇹🇩 SIGAD v3.0 — Plan Directeur d'Exécution Technique (Agent Blueprint)
**Système Intégré de Gestion des Aides et des Distributions — République du Tchad**  
**Version de référence :** 3.0 (22 Octobre 2026)  
**Architecture Cible :** Cloudflare Workers (Hono) + Cloudflare D1 (SQLite) + Cloudflare R2 + React (Vite, TypeScript, Tailwind CSS, PWA)

---

## ⚠️ 1. التوجيهات الصارمة للوكيل المنفذ (Strict Agent Directives)

أيها الوكيل البرمجي، يُعتبر هذا المستند بمثابة **العقد الهندسي الملزم (System Prompt & Blueprint)** لبناء منصة **SIGAD**. يجب عليك الالتزام الحرفي بالقواعد التالية في كل سطر برمجي تكتبه:

1. **حصريّة اللغة الفرنسية (100% French Only) :**
   - واجهة المستخدم (UI)، رسائل الخطأ، الإشعارات، التقارير، أسماء الجداول، أسماء الأعمدة في قاعدة البيانات، ومسارات الـ API الوظيفية يجب أن تكون **باللغة الفرنسية حصراً**.
   - يُمنع منعاً باتاً إضافة أي خيارات لتبديل اللغة (لا عربي ولا إنجليزي في الواجهة).
   - التنسيق الإجباري: المنطقة الزمنية `Africa/Ndjamena`، التاريخ `JJ/MM/AAAA`، الأرقام بالتنسيق الفرنسي (`10 000,50`).

2. **الفصل الجوهري بين الوحدتين التشغيليتين (Core Architectural Decision) :**
   - يجب بناء النظام على وحدتين مستقلتين ومترابطتين عبر المخزون فقط:
     1. `Approvisionnements centraux` (تُطلقها الإدارة المركزية لنقل الموارد للولايات).
     2. `Distributions provinciales` (ينشئها ويعتمدها وينفذها المندوب الولائي باستقلالية تامة).
   - **قاعدة ذهبية:** لا تفترض أبداً أن عملية التوزيع الولائية تتطلب وجود عملية إمداد مركزي سابقة؛ فالمندوب يمكنه التوزيع من إمداد مركزي، أو إمداد مباشر من شريك (`Approvisionnement direct`)، أو من مخزون سابق (`Stock existant`).

3. **العزل الولائي الصارم (Strict Provincial Isolation / Multi-tenancy) :**
   - كل مستخدم من فئة `DELEGUE_PROVINCIAL` مرتبط بـ `province_id` واحد فقط في الجلسة (Session/JWT).
   - يُمنع تمرير `province_id` من طلبات الواجهة الأمامية للمندوب، بل يُستخرج إجبارياً من سياق المصادقة (`c.get('user').province_id`) في جميع استعلامات `SELECT`, `INSERT`, `UPDATE`.

4. **سلامة المخزون والمعاملات الذرية (Stock Integrity & Atomicity) :**
   - الرصيد يُحسب دائماً كالتالي: $\text{Solde Disponible} = \text{Solde Physique} - \text{Solde Réservé}$.
   - يُمنع المخزون السالب ($\text{Solde Disponible} < 0$) عبر قيود برمجية وقيود قاعدة البيانات (`CHECK`).
   - جميع عمليات استلام الشحنات، حجز المواد للتوزيع، الصرف للمستفيدين، وإغلاق العمليات يجب أن تتم داخل معاملات ذرية (`db.batch([...])` في Cloudflare D1).
   - الشحنات المركزية المرسلة (`EN_EXPEDITION`) **لا تدخل** في المخزون المتاح للولاية إلا بعد تسجيل واعتماد محضر الاستلام الولائي (`receptions_provinciales`).

5. **عدم القابلية للتكرار (Idempotency) وعدم الحذف (Immutability) :**
   - كل عملية صرف ميداني (`remises_distribution`) أو حركة مخزنية تتطلب مفتاح عدم تكرار (`Cle-Idempotence` في الـ Header يُحفظ في جدول `cles_idempotence`).
   - يُمنع استخدام `DELETE` على أي سجل تشغيلي أو مخزني أو تاريخي. التعديلات تتم عبر قيود عكسية أو حالات (`ANNULE`, `RECTIFIE`) مع التوثيق في `journaux_audit`.

6. **الالتزام بحدود الخطة المجانية لـ Cloudflare (Free Tier Optimization) :**
   - Workers: $100\,000\text{ requêtes/jour}$ | D1 Reads: $5\,000\,000\text{ lignes/jour}$ | D1 Writes: $100\,000\text{ lignes/jour}$ | D1 Storage: $5\text{ Go}$ | R2: $10\text{ Go}$.
   - **إجراءات إجبارية:**
     - يُمنع أي استعلام بدون `LIMIT` و `OFFSET` (أو Cursor Pagination).
     - يُمنع عمل `SELECT *` أو عمل استعلامات داخل حلقات تكرارية ($N+1\text{ Queries}$).
     - استخدام فهارس مركبة (Composite Indexes) دقيقة لتقليل عدد الصفوف المقروءة (Rows Scanned) في D1.
     - تحديث أرصدة المخزون في جدول `soldes_stock` مباشرة داخل نفس معاملة الحركة بدلاً من جمع حركات `mouvements_stock` في كل قراءة.

---

## 🏗️ 2. هيكل المستودع البرمجي (Monorepo Structure)

يجب إنشاء المشروع بهيكلية نظيفة تفصل الواجهة عن الخادم مع مشاركة الأنواع ومخططات التحقق (Zod Schemas):

```text
sigad-tchad/
├── package.json
├── tsconfig.base.json
├── wrangler.toml                     # إعدادات Cloudflare (Workers, D1, R2)
├── migrations/                       # ملفات SQL مرتبة بالتسلسل لقاعدة بيانات D1
│   ├── 0001_utilisateurs_securite.sql
│   ├── 0002_referentiel_territorial.sql
│   ├── 0003_partenaires_beneficiaires.sql
│   ├── 0004_articles_et_stocks.sql
│   ├── 0005_approvisionnements_centraux.sql
│   ├── 0006_distributions_provinciales.sql
│   ├── 0007_controle_et_documents.sql
│   └── 0008_seed_initial_data.sql    # الـ 23 ولاية، الـ 25 حساب، الفئات والوحدات
├── shared/                           # كود مشترك بين الواجهة والخادم
│   ├── types/                        # تعريفات TypeScript بالفرنسية
│   ├── validations/                  # مخططات Zod للتحقق من المدخلات برسائل فرنسية
│   └── constantes/                   # الأدوار، الحالات، قائمة الولايات الـ 23
├── backend/                          # Cloudflare Worker (Hono API)
│   ├── src/
│   │   ├── index.ts                  # نقطة الدخول وتوجيه المسارات
│   │   ├── bindings.ts               # Env { DB: D1Database, BUCKET: R2Bucket, JWT_SECRET: string }
│   │   ├── middlewares/
│   │   │   ├── auth.middleware.ts    # التحقق من الجلسة وإجبار تغيير كلمة المرور الأولية
│   │   │   ├── rbac.middleware.ts    # فحص الدور والعزل الولائي (Province Isolation)
│   │   │   ├── idempotence.middleware.ts
│   │   │   ├── csrf.middleware.ts
│   │   │   └── audit.middleware.ts
│   │   ├── services/                 # منطق الأعمال المعزول (Pure Business Logic)
│   │   │   ├── stock.service.ts      # FEFO, Réservations, Mouvements atomiques
│   │   │   ├── approvisionnement.service.ts
│   │   │   ├── distribution.service.ts
│   │   │   ├── territoire.service.ts
│   │   │   └── rapport.service.ts
│   │   └── routes/                   # مسارات Hono API
│   │       ├── auth.routes.ts
│   │       ├── utilisateurs.routes.ts
│   │       ├── territoire.routes.ts
│   │       ├── partenaires.routes.ts
│   │       ├── beneficiaires.routes.ts
│   │       ├── stocks.routes.ts
│   │       ├── approvisionnements.routes.ts
│   │       ├── distributions.routes.ts
│   │       ├── controle.routes.ts
│   │       └── rapports.routes.ts
├── frontend/                         # React + TypeScript + Tailwind CSS + Vite PWA
│   ├── index.html                    # lang="fr" dir="ltr"
│   ├── vite.config.ts                # إعدادات VitePWA
│   ├── tailwind.config.js            # الهوية البصرية (الأزرق الإداري)
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── context/                  # AuthContext, ToastContext
│       ├── hooks/                    # useApi, useTerritoireDynamique, usePagination
│       ├── components/
│       │   ├── layout/               # Sidebar, Header, MobileNav
│       │   ├── ui/                   # Tableaux, CartesStatistiques, Modales, Stepper
│       │   └── formulaires/          # SelecteurLocalisationDynamique (المدن/القرى/المخيمات)
│       └── pages/
│           ├── connexion/            # تسجيل الدخول + التغيير الإجباري لكلمة المرور
│           ├── proprietaire/         # إدارة الحسابات، المرجع الجغرافي، التدقيق، النسخ الاحتياطي
│           ├── central/              # لوحة القيادة الوطنية، الإمدادات، الرقابة والإغلاق، التقارير
│           └── provincial/           # لوحة الولاية، الاستلام، المخزون، التوزيعات، المستفيدين
└── tests/
    ├── unit/                         # Vitest لمنطق الأعمال والمخزون
    ├── integration/                  # اختبارات العزل الولائي والتزامن الذري
    └── e2e/                          # Playwright لرحلة الإمداد والتوزيع كاملة
```

---

## 🗄️ 3. المخطط الكامل لقاعدة البيانات (Cloudflare D1 Schema — 48 Table)

يجب على الوكيل إنشاء ملفات الترحيل (Migrations) بحيث تطابق أسماء الجداول والأعمدة الواردة في المواصفات حرفياً باللغة الفرنسية، مع تفعيل المفاتيح الخارجية (`PRAGMA foreign_keys = ON;`).

### 3.1. الوحدة الأولى: المستخدمون والأمن (`0001_utilisateurs_securite.sql`)
```sql
CREATE TABLE utilisateurs (
    id TEXT PRIMARY KEY,
    identifiant TEXT NOT NULL UNIQUE, -- ex: 'proprietaire', 'central', 'ouaddai', 'sila'...
    nom_complet TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('PROPRIETAIRE', 'ADMIN_CENTRAL', 'DELEGUE_PROVINCIAL')),
    province_id TEXT, -- NULL للمالك والمركزي، وإجباري للمندوب الولائي
    mot_de_passe_hash TEXT NOT NULL,
    code_activation_hash TEXT,
    doit_changer_mot_de_passe INTEGER NOT NULL DEFAULT 1, -- 1 = Oui, 0 = Non
    double_facteur_secret TEXT,
    double_facteur_actif INTEGER NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'SUSPENDU', 'VERROUILLE')),
    tentatives_echouees INTEGER NOT NULL DEFAULT 0,
    verrouille_jusqua TEXT,
    derniere_connexion TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    modifie_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    jeton_hash TEXT NOT NULL UNIQUE,
    jeton_csrf TEXT NOT NULL,
    adresse_ip TEXT,
    agent_utilisateur TEXT,
    expire_le TEXT NOT NULL,
    revoquee INTEGER NOT NULL DEFAULT 0,
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE evenements_connexion (
    id TEXT PRIMARY KEY,
    identifiant_tente TEXT NOT NULL,
    utilisateur_id TEXT REFERENCES utilisateurs(id),
    succes INTEGER NOT NULL,
    motif_echec TEXT,
    adresse_ip TEXT,
    agent_utilisateur TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE journaux_audit (
    id TEXT PRIMARY KEY,
    utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    role_utilisateur TEXT NOT NULL,
    province_id TEXT,
    action TEXT NOT NULL, -- ex: 'CREATION_APPROVISIONNEMENT', 'VALIDATION_DISTRIBUTION'
    entite_type TEXT NOT NULL,
    entite_id TEXT NOT NULL,
    donnees_avant TEXT, -- JSON
    donnees_apres TEXT, -- JSON
    adresse_ip TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE parametres_systeme (
    cle TEXT PRIMARY KEY,
    valeur TEXT NOT NULL,
    description TEXT NOT NULL,
    modifie_par TEXT REFERENCES utilisateurs(id),
    modifie_le TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3.2. الوحدة الثانية: المرجع الجغرافي والإداري لتشاد (`0002_referentiel_territorial.sql`)
*ملاحظة هندسية: يفصل هذا التصميم بين الإدارة الترابية، التنظيم البلدي (500 بلدية وفق القانون العضوي 015/CNT/2024 والوضع الخاص لأنجمينا 022/CNT/2024)، والمواقع الميدانية، ويدعم المقترحات الولائية.*

```sql
CREATE TABLE provinces (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE, -- ex: 'TD-OD' (Ouaddaï), 'TD-SI' (Sila)
    identifiant_compte TEXT NOT NULL UNIQUE, -- ex: 'ouaddai', 'sila'
    nom TEXT NOT NULL UNIQUE,
    chef_lieu TEXT NOT NULL,
    statut_particulier INTEGER NOT NULL DEFAULT 0, -- 1 pour N'Djamena
    actif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE departements (
    id TEXT PRIMARY KEY,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    code TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    chef_lieu TEXT,
    actif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE sous_prefectures (
    id TEXT PRIMARY KEY,
    departement_id TEXT NOT NULL REFERENCES departements(id),
    code TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    actif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE communes (
    id TEXT PRIMARY KEY,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    code TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    type_commune TEXT NOT NULL CHECK (type_commune IN ('URBAINE', 'RURALE')),
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('PROPOSE', 'VALIDE', 'ARCHIVE')),
    source_officielle TEXT DEFAULT 'Loi Organique 015/CNT/2024',
    date_effet TEXT,
    actif INTEGER NOT NULL DEFAULT 1
);

-- يدعم ارتباط البلدية بمحافظة فرعية أو أكثر مع توثيق المصدر وفترة السريان
CREATE TABLE rattachements_territoriaux (
    id TEXT PRIMARY KEY,
    commune_id TEXT NOT NULL REFERENCES communes(id),
    departement_id TEXT REFERENCES departements(id),
    sous_prefecture_id TEXT REFERENCES sous_prefectures(id),
    source_juridique TEXT NOT NULL,
    date_debut_validite TEXT NOT NULL,
    date_fin_validite TEXT,
    est_principal INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE cantons (
    id TEXT PRIMARY KEY,
    sous_prefecture_id TEXT NOT NULL REFERENCES sous_prefectures(id),
    nom TEXT NOT NULL,
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('PROPOSE', 'VALIDE', 'REJETE')),
    cree_par TEXT REFERENCES utilisateurs(id)
);

-- يشمل المدن والقرى والـ Ferricks والـ Campements مع تحديد نوع التقسيم الحضري للمدن
CREATE TABLE localites (
    id TEXT PRIMARY KEY,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    departement_id TEXT NOT NULL REFERENCES departements(id),
    sous_prefecture_id TEXT REFERENCES sous_prefectures(id),
    commune_id TEXT REFERENCES communes(id),
    canton_id TEXT REFERENCES cantons(id),
    nom TEXT NOT NULL,
    type_localite TEXT NOT NULL CHECK (type_localite IN ('VILLE', 'VILLAGE', 'FERRICK', 'CAMPEMENT')),
    mode_decoupage_urbain TEXT NOT NULL DEFAULT 'AUCUN' CHECK (mode_decoupage_urbain IN ('AUCUN', 'SANS_ARRONDISSEMENT', 'AVEC_ARRONDISSEMENTS')),
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('PROPOSE', 'VALIDE', 'REJETE')),
    source_documentation TEXT,
    date_effet TEXT,
    propose_par TEXT REFERENCES utilisateurs(id),
    valide_par TEXT REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE arrondissements (
    id TEXT PRIMARY KEY,
    localite_id TEXT NOT NULL REFERENCES localites(id), -- المدينة التي تقبل دوائر
    commune_id TEXT REFERENCES communes(id),
    code TEXT,
    nom TEXT NOT NULL,
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE'
);

CREATE TABLE quartiers (
    id TEXT PRIMARY KEY,
    localite_id TEXT NOT NULL REFERENCES localites(id),
    arrondissement_id TEXT REFERENCES arrondissements(id), -- NULL إذا كانت المدينة بدون دوائر
    nom TEXT NOT NULL,
    possede_carres INTEGER NOT NULL DEFAULT 0,
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('PROPOSE', 'VALIDE', 'REJETE')),
    propose_par TEXT REFERENCES utilisateurs(id)
);

CREATE TABLE carres (
    id TEXT PRIMARY KEY,
    quartier_id TEXT NOT NULL REFERENCES quartiers(id),
    code_ou_nom TEXT NOT NULL,
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE'
);

CREATE TABLE sites_humanitaires (
    id TEXT PRIMARY KEY,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    departement_id TEXT NOT NULL REFERENCES departements(id),
    sous_prefecture_id TEXT REFERENCES sous_prefectures(id),
    commune_id TEXT REFERENCES communes(id),
    localite_proche_id TEXT REFERENCES localites(id),
    code_site TEXT UNIQUE,
    nom TEXT NOT NULL,
    categorie_site TEXT NOT NULL CHECK (categorie_site IN ('CAMP_REFUGIES', 'SITE_DEPLACES', 'CENTRE_ACCUEIL', 'SITE_TRANSIT', 'AUTRE_SITE')),
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('PROPOSE', 'VALIDE', 'FERME')),
    propose_par TEXT REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE historique_decoupages (
    id TEXT PRIMARY KEY,
    entite_type TEXT NOT NULL,
    entite_id TEXT NOT NULL,
    type_modification TEXT NOT NULL,
    anciennes_valeurs TEXT, -- JSON
    nouvelles_valeurs TEXT, -- JSON
    source_officielle TEXT,
    date_effet TEXT NOT NULL,
    auteur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3.3. الوحدة الثالثة: الشركاء والمستفيدون (`0003_partenaires_beneficiaires.sql`)
```sql
CREATE TABLE partenaires (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE,
    nom TEXT NOT NULL UNIQUE,
    sigle TEXT,
    type_organisation TEXT NOT NULL, -- ONG Internationale, Agence ONU, ONG Nationale, État...
    contact_email TEXT,
    contact_telephone TEXT,
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('PROPOSE', 'VALIDE', 'INACTIF')),
    propose_par TEXT REFERENCES utilisateurs(id),
    valide_par TEXT REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE roles_partenaires (
    id TEXT PRIMARY KEY,
    partenaire_id TEXT NOT NULL REFERENCES partenaires(id),
    role TEXT NOT NULL CHECK (role IN ('BAILLEUR_DE_FONDS', 'DONATEUR', 'FOURNISSEUR', 'PARTENAIRE_EXECUTION', 'TRANSPORTEUR', 'GESTIONNAIRE_SITE')),
    UNIQUE(partenaire_id, role)
);

CREATE TABLE affectations_partenaires (
    id TEXT PRIMARY KEY,
    partenaire_id TEXT NOT NULL REFERENCES partenaires(id),
    role TEXT NOT NULL,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('APPROVISIONNEMENT_CENTRAL', 'DISTRIBUTION_PROVINCIALE', 'SITE_HUMANITAIRE')),
    operation_id TEXT NOT NULL,
    observations TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE categories_population (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE, -- AUTOCHTONE, DEPLACE_INTERNE, REFUGIE, RETOURNE, HOTE_VULNERABLE
    libelle TEXT NOT NULL,
    description TEXT
);

CREATE TABLE vulnerabilites (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE, -- FEMME_CHEF_MENAGE, HANDICAP, PERSONNE_AGEE, ENFANT_NON_ACCOMPAGNE, MALNUTRITION
    libelle TEXT NOT NULL,
    niveau_priorite INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE menages (
    id TEXT PRIMARY KEY,
    code_menage TEXT NOT NULL UNIQUE, -- ex: 'MEN-OD-2026-000145'
    province_id TEXT NOT NULL REFERENCES provinces(id),
    departement_id TEXT NOT NULL REFERENCES departements(id),
    sous_prefecture_id TEXT REFERENCES sous_prefectures(id),
    commune_id TEXT REFERENCES communes(id),
    localite_id TEXT REFERENCES localites(id),
    arrondissement_id TEXT REFERENCES arrondissements(id),
    quartier_id TEXT REFERENCES quartiers(id),
    carre_id TEXT REFERENCES carres(id),
    site_humanitaire_id TEXT REFERENCES sites_humanitaires(id),
    nom_chef_menage TEXT NOT NULL,
    sexe_chef TEXT NOT NULL CHECK (sexe_chef IN ('M', 'F')),
    nombre_personnes INTEGER NOT NULL CHECK (nombre_personnes > 0),
    telephone TEXT,
    categorie_population_id TEXT NOT NULL REFERENCES categories_population(id),
    criteres_vulnerabilite TEXT, -- JSON Array of codes
    date_enregistrement TEXT NOT NULL,
    statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'INACTIF', 'DOUBLON_SUSPECTE', 'ARCHIVE')),
    cree_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE membres_menage (
    id TEXT PRIMARY KEY,
    menage_id TEXT NOT NULL REFERENCES menages(id),
    nom_complet TEXT NOT NULL,
    sexe TEXT NOT NULL CHECK (sexe IN ('M', 'F')),
    annee_naissance INTEGER,
    lien_parente TEXT NOT NULL,
    identifiant_individuel TEXT
);

CREATE TABLE listes_beneficiaires (
    id TEXT PRIMARY KEY,
    reference_liste TEXT NOT NULL UNIQUE,
    intitule TEXT NOT NULL,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    nombre_menages_cibles INTEGER NOT NULL DEFAULT 0,
    nombre_personnes_cibles INTEGER NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'BROUILLON' CHECK (statut IN ('BROUILLON', 'PRETE', 'VERROUILLEE')),
    cree_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE inscriptions_beneficiaires (
    id TEXT PRIMARY KEY,
    liste_id TEXT NOT NULL REFERENCES listes_beneficiaires(id),
    menage_id TEXT NOT NULL REFERENCES menages(id),
    ordre_affichage INTEGER,
    statut_verification TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_verification IN ('VALIDE', 'ECARTE_DOUBLON', 'EN_VERIFICATION')),
    UNIQUE(liste_id, menage_id)
);

CREATE TABLE signalements_doublons (
    id TEXT PRIMARY KEY,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    menage_source_id TEXT NOT NULL REFERENCES menages(id),
    menage_suspect_id TEXT NOT NULL REFERENCES menages(id),
    motif_similitude TEXT NOT NULL, -- ex: 'MEME_TELEPHONE', 'NOM_ET_LOCALITE_SIMILAIRES'
    statut_traitement TEXT NOT NULL DEFAULT 'EN_ATTENTE' CHECK (statut_traitement IN ('EN_ATTENTE', 'CONFIRME_DISTINCT', 'CONFIRME_DOUBLON')),
    traite_par TEXT REFERENCES utilisateurs(id),
    observations TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3.4. الوحدة الرابعة: المواد والمخزون (`0004_articles_et_stocks.sql`)
```sql
CREATE TABLE categories_aide (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE, -- ALIMENTAIRE, MENAGER, HYGIENE, ABRI, AUTRE_NFI
    libelle TEXT NOT NULL
);

CREATE TABLE unites_mesure (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE, -- KG, LITRE, SAC, CARTON, PIECE, KIT
    libelle TEXT NOT NULL,
    decimales_autorisees INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE conditionnements (
    id TEXT PRIMARY KEY,
    libelle TEXT NOT NULL UNIQUE, -- ex: 'Sac de 50 kg', 'Bidon de 5 litres', 'Carton de 24 pièces'
    unite_base_id TEXT NOT NULL REFERENCES unites_mesure(id),
    facteur_conversion REAL NOT NULL DEFAULT 1
);

CREATE TABLE articles (
    id TEXT PRIMARY KEY,
    code_article TEXT NOT NULL UNIQUE, -- ex: 'ALIM-RIZ-50KG'
    designation TEXT NOT NULL,
    categorie_id TEXT NOT NULL REFERENCES categories_aide(id),
    unite_mesure_id TEXT NOT NULL REFERENCES unites_mesure(id),
    conditionnement_id TEXT REFERENCES conditionnements(id),
    perissable INTEGER NOT NULL DEFAULT 0, -- 1 = applique la règle FEFO
    actif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE entrepots (
    id TEXT PRIMARY KEY,
    code_entrepot TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    niveau TEXT NOT NULL CHECK (niveau IN ('CENTRAL', 'PROVINCIAL')),
    province_id TEXT REFERENCES provinces(id), -- NULL si central national, obligatoire si provincial
    localite_id TEXT REFERENCES localites(id),
    adresse_detaillee TEXT,
    capacite_indicative TEXT,
    responsable_nom TEXT,
    responsable_telephone TEXT,
    actif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE lots_stock (
    id TEXT PRIMARY KEY,
    numero_lot TEXT NOT NULL,
    article_id TEXT NOT NULL REFERENCES articles(id),
    entrepot_id TEXT NOT NULL REFERENCES entrepots(id),
    province_id TEXT REFERENCES provinces(id),
    source_type TEXT NOT NULL CHECK (source_type IN ('APPROVISIONNEMENT_CENTRAL', 'APPROVISIONNEMENT_DIRECT', 'STOCK_INITIAL')),
    source_reference_id TEXT, -- ID de la réception ou de l'approvisionnement
    partenaire_bailleur_id TEXT REFERENCES partenaires(id),
    date_peremption TEXT, -- Utilisé pour le tri FEFO
    etat_qualite TEXT NOT NULL DEFAULT 'BON' CHECK (etat_qualite IN ('BON', 'ENDOMMAGE', 'PERIME', 'QUARANTAINE')),
    quantite_initiale REAL NOT NULL CHECK (quantite_initiale >= 0),
    quantite_physique REAL NOT NULL CHECK (quantite_physique >= 0),
    quantite_reservee REAL NOT NULL DEFAULT 0 CHECK (quantite_reservee >= 0),
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (quantite_physique >= quantite_reservee)
);

CREATE TABLE soldes_stock (
    id TEXT PRIMARY KEY,
    entrepot_id TEXT NOT NULL REFERENCES entrepots(id),
    province_id TEXT REFERENCES provinces(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    quantite_physique REAL NOT NULL DEFAULT 0 CHECK (quantite_physique >= 0),
    quantite_reservee REAL NOT NULL DEFAULT 0 CHECK (quantite_reservee >= 0),
    quantite_disponible REAL GENERATED ALWAYS AS (quantite_physique - quantite_reservee) VIRTUAL,
    seuil_alerte REAL NOT NULL DEFAULT 0,
    derniere_maj TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(entrepot_id, article_id),
    CHECK (quantite_physique >= quantite_reservee)
);

-- لتسجيل المواد الواردة مباشرة من الشركاء في الولاية أو التوريدات المباشرة للمخزن
CREATE TABLE receptions_stock (
    id TEXT PRIMARY KEY,
    reference_reception TEXT NOT NULL UNIQUE,
    entrepot_id TEXT NOT NULL REFERENCES entrepots(id),
    province_id TEXT REFERENCES provinces(id),
    type_entree TEXT NOT NULL CHECK (type_entree IN ('APPROVISIONNEMENT_DIRECT_PARTENAIRE', 'APPROVISIONNEMENT_CENTRAL', 'RETOUR_DISTRIBUTION', 'STOCK_INITIAL')),
    partenaire_id TEXT REFERENCES partenaires(id),
    date_reception TEXT NOT NULL,
    numero_bordereau_externe TEXT,
    observations TEXT,
    piece_jointe_id TEXT,
    enregistre_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE lignes_reception (
    id TEXT PRIMARY KEY,
    reception_stock_id TEXT NOT NULL REFERENCES receptions_stock(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    lot_stock_id TEXT NOT NULL REFERENCES lots_stock(id),
    quantite_recue REAL NOT NULL CHECK (quantite_recue > 0),
    quantite_acceptee REAL NOT NULL CHECK (quantite_acceptee >= 0),
    quantite_endommagee REAL NOT NULL DEFAULT 0 CHECK (quantite_endommagee >= 0),
    date_peremption TEXT
);

CREATE TABLE mouvements_stock (
    id TEXT PRIMARY KEY,
    reference_mouvement TEXT NOT NULL UNIQUE,
    entrepot_id TEXT NOT NULL REFERENCES entrepots(id),
    province_id TEXT REFERENCES provinces(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    lot_stock_id TEXT REFERENCES lots_stock(id),
    type_mouvement TEXT NOT NULL CHECK (type_mouvement IN ('RECEPTION', 'ENTREE', 'SORTIE_EXPEDITION', 'SORTIE_DISTRIBUTION', 'RESERVATION', 'LIBERATION_RESERVATION', 'TRANSFERT_SORTANT', 'TRANSFERT_ENTRANT', 'RETOUR', 'AJUSTEMENT_POSITIF', 'AJUSTEMENT_NEGATIF', 'PERTE', 'INVENTAIRE')),
    sens TEXT NOT NULL CHECK (sens IN ('PLUS', 'MOINS', 'NEUTRE_RESERVATION')),
    quantite REAL NOT NULL CHECK (quantite > 0),
    solde_physique_avant REAL NOT NULL,
    solde_physique_apres REAL NOT NULL,
    document_source_type TEXT NOT NULL,
    document_source_id TEXT NOT NULL,
    motif TEXT NOT NULL,
    auteur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE reservations_stock (
    id TEXT PRIMARY KEY,
    distribution_id TEXT NOT NULL,
    entrepot_id TEXT NOT NULL REFERENCES entrepots(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    lot_stock_id TEXT NOT NULL REFERENCES lots_stock(id),
    quantite_reservee REAL NOT NULL CHECK (quantite_reservee > 0),
    quantite_consommee REAL NOT NULL DEFAULT 0 CHECK (quantite_consommee >= 0),
    quantite_liberee REAL NOT NULL DEFAULT 0 CHECK (quantite_liberee >= 0),
    statut TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (statut IN ('ACTIVE', 'CONSOMMEE', 'LIBEREE_CLOTURE', 'ANNULEE')),
    cree_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE ajustements_stock (
    id TEXT PRIMARY KEY,
    reference_ajustement TEXT NOT NULL UNIQUE,
    entrepot_id TEXT NOT NULL REFERENCES entrepots(id),
    province_id TEXT REFERENCES provinces(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    lot_stock_id TEXT NOT NULL REFERENCES lots_stock(id),
    type_ajustement TEXT NOT NULL CHECK (type_ajustement IN ('INVENTAIRE', 'PERTE', 'AVARIE', 'CORRECTION_ERREUR')),
    ecart_quantite REAL NOT NULL, -- positif ou négatif
    motif_detaille TEXT NOT NULL,
    piece_justificative_id TEXT,
    auteur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3.5. الوحدة الخامسة: عمليات الإمداد المركزي (`0005_approvisionnements_centraux.sql`)
```sql
CREATE TABLE approvisionnements_centraux (
    id TEXT PRIMARY KEY,
    reference TEXT NOT NULL UNIQUE, -- ex: 'APP-NAT-2026-001'
    intitule_operation TEXT NOT NULL,
    date_creation TEXT NOT NULL,
    description TEXT,
    source_articles TEXT NOT NULL CHECK (source_articles IN ('ENTREPOT_CENTRAL', 'FOURNISSEUR_EXTERNE', 'DON_PARTENAIRE')),
    partenaire_id TEXT REFERENCES partenaires(id),
    nature_aide TEXT NOT NULL, -- Alimentaire, NFI, Mixte
    date_prevue_expedition TEXT,
    instructions TEXT,
    statut TEXT NOT NULL DEFAULT 'BROUILLON' CHECK (statut IN ('BROUILLON', 'VALIDEE', 'EN_EXPEDITION', 'PARTIELLEMENT_RECEPTIONNEE', 'RECEPTIONNEE', 'EN_RAPPROCHEMENT', 'CLOTUREE')),
    cree_par TEXT NOT NULL REFERENCES utilisateurs(id),
    valide_par TEXT REFERENCES utilisateurs(id),
    date_validation TEXT,
    cloture_par TEXT REFERENCES utilisateurs(id),
    date_cloture TEXT,
    observations_cloture TEXT
);

CREATE TABLE destinations_approvisionnement (
    id TEXT PRIMARY KEY,
    approvisionnement_id TEXT NOT NULL REFERENCES approvisionnements_centraux(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    statut_destination TEXT NOT NULL DEFAULT 'PLANIFIEE' CHECK (statut_destination IN ('PLANIFIEE', 'EN_EXPEDITION', 'PARTIELLEMENT_RECEPTIONNEE', 'RECEPTIONNEE', 'EN_ECART', 'CLOTUREE')),
    UNIQUE(approvisionnement_id, province_id)
);

CREATE TABLE articles_approvisionnement (
    id TEXT PRIMARY KEY,
    approvisionnement_id TEXT NOT NULL REFERENCES approvisionnements_centraux(id),
    destination_id TEXT NOT NULL REFERENCES destinations_approvisionnement(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    quantite_allouee REAL NOT NULL CHECK (quantite_allouee > 0),
    quantite_expediee REAL NOT NULL DEFAULT 0 CHECK (quantite_expediee >= 0),
    quantite_receptionnee_acceptee REAL NOT NULL DEFAULT 0 CHECK (quantite_receptionnee_acceptee >= 0),
    UNIQUE(destination_id, article_id)
);

CREATE TABLE expeditions (
    id TEXT PRIMARY KEY,
    reference_expedition TEXT NOT NULL UNIQUE, -- ex: 'EXP-2026-001-OD'
    approvisionnement_id TEXT NOT NULL REFERENCES approvisionnements_centraux(id),
    destination_id TEXT NOT NULL REFERENCES destinations_approvisionnement(id),
    province_destinataire_id TEXT NOT NULL REFERENCES provinces(id),
    date_expedition TEXT NOT NULL,
    origine_expedition TEXT NOT NULL CHECK (origine_expedition IN ('ENTREPOT_CENTRAL', 'LIVRAISON_DIRECTE_FOURNISSEUR')),
    entrepot_origine_id TEXT REFERENCES entrepots(id), -- NULL si fournisseur externe direct
    reference_bordereau TEXT NOT NULL,
    transporteur_partenaire_id TEXT REFERENCES partenaires(id),
    informations_transport TEXT, -- Immatriculation camion, nom chauffeur, téléphone
    statut_expedition TEXT NOT NULL DEFAULT 'EN_ROUTE' CHECK (statut_expedition IN ('EN_ROUTE', 'RECEPTIONNEE', 'RECEPTIONNEE_AVEC_ECART')),
    cree_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE lignes_expedition (
    id TEXT PRIMARY KEY,
    expedition_id TEXT NOT NULL REFERENCES expeditions(id),
    article_approvisionnement_id TEXT NOT NULL REFERENCES articles_approvisionnement(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    lot_origine_id TEXT REFERENCES lots_stock(id),
    numero_lot_fournisseur TEXT,
    date_peremption TEXT,
    quantite_expediee REAL NOT NULL CHECK (quantite_expediee > 0)
);

CREATE TABLE receptions_provinciales (
    id TEXT PRIMARY KEY,
    reference_reception_prov TEXT NOT NULL UNIQUE, -- ex: 'REC-OD-2026-001'
    expedition_id TEXT NOT NULL UNIQUE REFERENCES expeditions(id),
    approvisionnement_id TEXT NOT NULL REFERENCES approvisionnements_centraux(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    entrepot_recepteur_id TEXT NOT NULL REFERENCES entrepots(id),
    date_reception TEXT NOT NULL,
    numero_pv_reception TEXT NOT NULL,
    comporte_ecarts INTEGER NOT NULL DEFAULT 0,
    statut_rapprochement TEXT NOT NULL DEFAULT 'AUCUN' CHECK (statut_rapprochement IN ('AUCUN', 'ECART_OUVERT', 'RAPPROCHE_JUSTIFIE')),
    observations TEXT,
    pv_piece_jointe_id TEXT,
    enregistre_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE lignes_reception_provinciale (
    id TEXT PRIMARY KEY,
    reception_provinciale_id TEXT NOT NULL REFERENCES receptions_provinciales(id),
    ligne_expedition_id TEXT NOT NULL REFERENCES lignes_expedition(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    quantite_expediee REAL NOT NULL,
    quantite_recue_physique REAL NOT NULL CHECK (quantite_recue_physique >= 0),
    quantite_acceptee REAL NOT NULL CHECK (quantite_acceptee >= 0),
    quantite_endommagee REAL NOT NULL DEFAULT 0 CHECK (quantite_endommagee >= 0),
    quantite_manquante REAL NOT NULL DEFAULT 0 CHECK (quantite_manquante >= 0),
    lot_cree_id TEXT REFERENCES lots_stock(id),
    justification_ecart TEXT
);
```

### 3.6. الوحدة السادسة: عمليات التوزيع الولائي (`0006_distributions_provinciales.sql`)
```sql
CREATE TABLE distributions_provinciales (
    id TEXT PRIMARY KEY,
    reference_distribution TEXT NOT NULL UNIQUE, -- ex: 'DIST-OD-2026-001'
    intitule_distribution TEXT NOT NULL,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    departement_id TEXT NOT NULL REFERENCES departements(id),
    sous_prefecture_id TEXT REFERENCES sous_prefectures(id),
    commune_id TEXT REFERENCES communes(id),
    nature_aide TEXT NOT NULL,
    bailleur_fonds_id TEXT REFERENCES partenaires(id),
    partenaire_execution_id TEXT REFERENCES partenaires(id),
    objectif TEXT NOT NULL,
    nombre_menages_cibles INTEGER NOT NULL CHECK (nombre_menages_cibles > 0),
    nombre_personnes_cibles INTEGER NOT NULL CHECK (nombre_personnes_cibles > 0),
    date_prevue TEXT NOT NULL,
    entrepot_id TEXT NOT NULL REFERENCES entrepots(id),
    liste_beneficiaires_id TEXT REFERENCES listes_beneficiaires(id),
    statut TEXT NOT NULL DEFAULT 'BROUILLON' CHECK (statut IN ('BROUILLON', 'EN_PREPARATION', 'VALIDEE_PROVINCE', 'EN_EXECUTION', 'TERMINEE_PROVINCE', 'RETOURNEE_POUR_CORRECTION', 'CLOTUREE_CENTRAL')),
    version_plan INTEGER NOT NULL DEFAULT 1,
    observations TEXT,
    cree_par TEXT NOT NULL REFERENCES utilisateurs(id),
    date_declaration_fin TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    modifie_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE zones_distribution (
    id TEXT PRIMARY KEY,
    distribution_id TEXT NOT NULL REFERENCES distributions_provinciales(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    localite_id TEXT REFERENCES localites(id),
    arrondissement_id TEXT REFERENCES arrondissements(id),
    quartier_id TEXT REFERENCES quartiers(id),
    carre_id TEXT REFERENCES carres(id),
    site_humanitaire_id TEXT REFERENCES sites_humanitaires(id),
    nom_site_distribution TEXT NOT NULL
);

CREATE TABLE articles_distribution (
    id TEXT PRIMARY KEY,
    distribution_id TEXT NOT NULL REFERENCES distributions_provinciales(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    source_approvisionnement TEXT NOT NULL CHECK (source_approvisionnement IN ('APPROVISIONNEMENT_CENTRAL', 'APPROVISIONNEMENT_DIRECT', 'STOCK_EXISTANT', 'MIXTE')),
    lot_stock_id TEXT REFERENCES lots_stock(id),
    ration_par_menage REAL NOT NULL CHECK (ration_par_menage > 0),
    quantite_totale_prevue REAL NOT NULL CHECK (quantite_totale_prevue > 0),
    quantite_reservee REAL NOT NULL DEFAULT 0,
    quantite_distribuee REAL NOT NULL DEFAULT 0
);

CREATE TABLE menages_distribution (
    id TEXT PRIMARY KEY,
    distribution_id TEXT NOT NULL REFERENCES distributions_provinciales(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    menage_id TEXT NOT NULL REFERENCES menages(id),
    zone_distribution_id TEXT REFERENCES zones_distribution(id),
    statut_service TEXT NOT NULL DEFAULT 'EN_ATTENTE' CHECK (statut_service IN ('EN_ATTENTE', 'SERVI', 'PARTIELLEMENT_SERVI', 'ABSENT', 'NON_SERVI')),
    date_service TEXT,
    motif_non_service TEXT,
    UNIQUE(distribution_id, menage_id)
);

CREATE TABLE allocations_distribution (
    id TEXT PRIMARY KEY,
    menage_distribution_id TEXT NOT NULL REFERENCES menages_distribution(id),
    distribution_id TEXT NOT NULL REFERENCES distributions_provinciales(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    quantite_prevue REAL NOT NULL CHECK (quantite_prevue > 0),
    quantite_servie REAL NOT NULL DEFAULT 0 CHECK (quantite_servie >= 0),
    UNIQUE(menage_distribution_id, article_id)
);

CREATE TABLE remises_distribution (
    id TEXT PRIMARY KEY,
    reference_remise TEXT NOT NULL UNIQUE,
    distribution_id TEXT NOT NULL REFERENCES distributions_provinciales(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    menage_distribution_id TEXT NOT NULL REFERENCES menages_distribution(id),
    menage_id TEXT NOT NULL REFERENCES menages(id),
    date_remise TEXT NOT NULL,
    identite_recepteur TEXT NOT NULL,
    emargement_reference TEXT,
    agent_distributeur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    cle_idempotence TEXT NOT NULL UNIQUE,
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE lignes_remise (
    id TEXT PRIMARY KEY,
    remise_id TEXT NOT NULL REFERENCES remises_distribution(id),
    allocation_id TEXT NOT NULL REFERENCES allocations_distribution(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    lot_stock_id TEXT NOT NULL REFERENCES lots_stock(id),
    reservation_id TEXT NOT NULL REFERENCES reservations_stock(id),
    quantite_remise REAL NOT NULL CHECK (quantite_remise > 0)
);

CREATE TABLE validations_distribution (
    id TEXT PRIMARY KEY,
    distribution_id TEXT NOT NULL REFERENCES distributions_provinciales(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    version_validee INTEGER NOT NULL,
    valide_par TEXT NOT NULL REFERENCES utilisateurs(id),
    date_validation TEXT NOT NULL DEFAULT (datetime('now')),
    snapshot_plan_json TEXT NOT NULL, -- copie figée du plan au moment de la validation
    observations TEXT
);

CREATE TABLE historique_statuts (
    id TEXT PRIMARY KEY,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('APPROVISIONNEMENT_CENTRAL', 'DISTRIBUTION_PROVINCIALE')),
    operation_id TEXT NOT NULL,
    statut_precedent TEXT,
    nouveau_statut TEXT NOT NULL,
    motif_ou_commentaire TEXT,
    auteur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE clotures_distribution (
    id TEXT PRIMARY KEY,
    distribution_id TEXT NOT NULL UNIQUE REFERENCES distributions_provinciales(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    total_menages_cibles INTEGER NOT NULL,
    total_menages_servis INTEGER NOT NULL,
    total_menages_partiels INTEGER NOT NULL,
    total_menages_absents INTEGER NOT NULL,
    total_menages_non_servis INTEGER NOT NULL,
    bilan_articles_json TEXT NOT NULL, -- synthèse figée: prévu, réservé, distribué, reliquat libéré
    pv_distribution_piece_id TEXT,
    cloture_par TEXT NOT NULL REFERENCES utilisateurs(id),
    date_cloture TEXT NOT NULL DEFAULT (datetime('now')),
    observations_finales TEXT
);
```

### 3.7. الوحدة السابعة: الرقابة، الوثائق، والتقارير (`0007_controle_et_documents.sql`)
```sql
CREATE TABLE observations_controle (
    id TEXT PRIMARY KEY,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('APPROVISIONNEMENT_CENTRAL', 'DISTRIBUTION_PROVINCIALE', 'STOCK_PROVINCIAL')),
    operation_id TEXT NOT NULL,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    niveau_gravite TEXT NOT NULL DEFAULT 'INFO' CHECK (niveau_gravite IN ('INFO', 'AVERTISSEMENT', 'CRITIQUE')),
    observation TEXT NOT NULL,
    auteur_central_id TEXT NOT NULL REFERENCES utilisateurs(id),
    reponse_delegue TEXT,
    date_reponse TEXT,
    statut TEXT NOT NULL DEFAULT 'OUVERTE' CHECK (statut IN ('OUVERTE', 'TRAITEE', 'CLASSEE')),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE demandes_correction (
    id TEXT PRIMARY KEY,
    distribution_id TEXT NOT NULL REFERENCES distributions_provinciales(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    motif_retour TEXT NOT NULL,
    elements_a_corriger TEXT NOT NULL, -- JSON ou texte structuré
    statut TEXT NOT NULL DEFAULT 'EN_ATTENTE_DELEGUE' CHECK (statut IN ('EN_ATTENTE_DELEGUE', 'CORRECTION_SOUMISE', 'VALIDEE_CENTRAL')),
    demande_par TEXT NOT NULL REFERENCES utilisateurs(id),
    traite_par_delegue TEXT REFERENCES utilisateurs(id),
    reponse_delegue TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    resolu_le TEXT
);

CREATE TABLE pieces_jointes (
    id TEXT PRIMARY KEY,
    cle_r2 TEXT NOT NULL UNIQUE, -- ex: 'provinces/ouaddai/2026/10/pv_dist_001.pdf'
    nom_fichier_original TEXT NOT NULL,
    type_mime TEXT NOT NULL,
    taille_octets INTEGER NOT NULL,
    categorie_document TEXT NOT NULL CHECK (categorie_document IN ('BORDEREAU_EXPEDITION', 'PV_RECEPTION', 'PV_DISTRIBUTION', 'LISTE_EMARGEMENT', 'JUSTIFICATIF_ECART', 'AUTRE')),
    entite_liee_type TEXT NOT NULL,
    entite_liee_id TEXT NOT NULL,
    province_id TEXT REFERENCES provinces(id),
    televerse_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE rapports_generes (
    id TEXT PRIMARY KEY,
    type_rapport TEXT NOT NULL,
    intitule TEXT NOT NULL,
    perimetre TEXT NOT NULL CHECK (perimetre IN ('NATIONAL', 'PROVINCIAL')),
    province_id TEXT REFERENCES provinces(id),
    filtres_appliques_json TEXT,
    format_export TEXT NOT NULL CHECK (format_export IN ('PDF', 'EXCEL', 'CSV')),
    cle_r2_archive TEXT,
    genere_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    destinataire_utilisateur_id TEXT REFERENCES utilisateurs(id),
    destinataire_province_id TEXT REFERENCES provinces(id),
    destinataire_role TEXT,
    titre TEXT NOT NULL,
    message TEXT NOT NULL,
    type_alerte TEXT NOT NULL CHECK (type_alerte IN ('INFO', 'ACTION_REQUISE', 'ALERTE_STOCK', 'DEMANDE_CORRECTION', 'CLOTURE')),
    lien_cible TEXT,
    lue INTEGER NOT NULL DEFAULT 0,
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE cles_idempotence (
    cle TEXT PRIMARY KEY,
    utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    route_api TEXT NOT NULL,
    statut_http INTEGER NOT NULL,
    reponse_json TEXT NOT NULL,
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    expire_le TEXT NOT NULL
);

-- الفهارس الإجبارية لتقليل استهلاك قراءات Cloudflare D1 (Free Tier)
CREATE INDEX idx_utilisateurs_province ON utilisateurs(province_id, role);
CREATE INDEX idx_menages_province_code ON menages(province_id, code_menage);
CREATE INDEX idx_menages_localisation ON menages(province_id, departement_id, localite_id, site_humanitaire_id);
CREATE INDEX idx_lots_stock_fefo ON lots_stock(entrepot_id, article_id, etat_qualite, date_peremption ASC);
CREATE INDEX idx_soldes_stock_prov ON soldes_stock(province_id, entrepot_id, article_id);
CREATE INDEX idx_mouvements_prov_date ON mouvements_stock(province_id, cree_le DESC);
CREATE INDEX idx_appro_statut ON approvisionnements_centraux(statut, date_creation DESC);
CREATE INDEX idx_expeditions_prov ON expeditions(province_destinataire_id, statut_expedition);
CREATE INDEX idx_dist_prov_statut ON distributions_provinciales(province_id, statut, date_prevue DESC);
CREATE INDEX idx_menages_dist_statut ON menages_distribution(distribution_id, statut_service);
```

---

## 🔐 4. مصفوفة الحسابات الـ 25 والولايات الـ 23 (`0008_seed_initial_data.sql`)

يجب على الوكيل توليد ملف البذر الأولي (`0008_seed_initial_data.sql`) ليحتوي على:
1. حساب المالك: `proprietaire` (الدور: `PROPRIETAIRE`).
2. حساب الإدارة المركزية: `central` (الدور: `ADMIN_CENTRAL`).
3. الحسابات الـ 23 للمندوبيات الولائية (الدور: `DELEGUE_PROVINCIAL`)، مرتبة ومربوطة بالجدول `provinces`:

| # | الولاية (Nom Officiel) | `code` | `identifiant_compte` | العاصـمة (`chef_lieu`) | ملاحظة تشريعية |
|---|---|---|---|---|---|
| 1 | Batha | `TD-BA` | `batha` | Ati | |
| 2 | Borkou | `TD-BO` | `borkou` | Faya-Largeau | |
| 3 | Chari-Baguirmi | `TD-CB` | `chari-baguirmi` | Massenya | |
| 4 | Ennedi-Est | `TD-EE` | `ennedi-est` | Amdjarass | |
| 5 | Ennedi-Ouest | `TD-EO` | `ennedi-ouest` | Fada | |
| 6 | Guéra | `TD-GR` | `guera` | Mongo | |
| 7 | Hadjer-Lamis | `TD-HL` | `hadjer-lamis` | Massakory | |
| 8 | Kanem | `TD-KA` | `kanem` | Mao | |
| 9 | Lac | `TD-LC` | `lac` | Bol | |
| 10 | Logone-Occidental | `TD-LO` | `logone-occidental` | Moundou | |
| 11 | Logone-Oriental | `TD-LR` | `logone-oriental` | Doba | |
| 12 | Mandoul | `TD-MA` | `mandoul` | Koumra | |
| 13 | Mayo-Kebbi-Est | `TD-ME` | `mayo-kebbi-est` | Bongor | |
| 14 | Mayo-Kebbi-Ouest | `TD-MO` | `mayo-kebbi-ouest` | Pala | |
| 15 | Moyen-Chari | `TD-MC` | `moyen-chari` | Sarh | |
| 16 | N'Djamena | `TD-ND` | `ndjamena` | N'Djamena | `statut_particulier = 1` (Loi 022/CNT/2024 - 10 Arrondissements) |
| 17 | Ouaddaï | `TD-OD` | `ouaddai` | Abéché | |
| 18 | Salamat | `TD-SA` | `salamat` | Am Timan | |
| 19 | Sila | `TD-SI` | `sila` | Goz Beïda | |
| 20 | Tandjilé | `TD-TA` | `tandjile` | Laï | |
| 21 | Tibesti | `TD-TI` | `tibesti` | Bardaï | |
| 22 | Wadi-Fira | `TD-WF` | `wadi-fira` | Biltine | |
| 23 | Barh-El-Gazel | `TD-BG` | `barh-el-gazel` | Moussoro | |

*ضابط أمني لكلمات المرور:*
- في بيئة التطوير المحلية (`ENVIRONMENT === 'development'`)، يُسمح بتهيئة الحسابات بكلمة مرور تطابق اسم الحساب (مثلاً `sila` / `sila`) مع تجزئتها بـ `PBKDF2` أو `Argon2id` (Web Crypto API المتوافقة مع Cloudflare Workers).
- في بيئة الإنتاج (`ENVIRONMENT === 'production'`)، يُنشأ سكريبت توليد رموز تفعيل عشوائية فريدة لكل حساب، ويُضبط `doit_changer_mot_de_passe = 1`، ويمنع `auth.middleware.ts` استدعاء أي مسار تشغيلي قبل إتمام تغيير كلمة المرور عبر المسار `/api/auth/changer-mot-de-passe-initial`.

---

## ⚙️ 5. القواعد الخوارزمية للخدمات الأساسية (Core Business Services Specifications)

يجب على الوكيل كتابة منطق الأعمال في مجلد `backend/src/services/` وفق الخوارزميات الدقيقة التالية:

### 5.1. خوارزمية الحقول الديناميكية للموقع الجغرافي (`territoire.service.ts` & `SelecteurLocalisationDynamique.tsx`)
عند إدخال أسرة أو تحديد منطقة توزيع أو مخزن:
1. يختار المستخدم `Province` (أو تكون مثبتة تلقائياً للمندوب الولائي) $\leftarrow$ `Département` $\leftarrow$ `Sous-préfecture` / `Commune`.
2. يختار نوع الموقع (`Nature du lieu`) :
   - **خيار 1 : `Village / Ferrick / Campement`**
     - يعرض النظام قائمة القرى المرتبطة (مع إمكانية اقتراح قرية جديدة `PROPOSE`).
     - **يُخفي تماماً** حقول `Arrondissement` و `Quartier` و `Carré`.
   - **خيار 2 : `Ville`**
     - يفحص النظام خاصية `mode_decoupage_urbain` للمدينة المختارة في جدول `localites`:
       - إذا كانت `SANS_ARRONDISSEMENT`: يعرض حقل `Quartier` مباشرة ويُخفي `Arrondissement`.
       - إذا كانت `AVEC_ARRONDISSEMENTS` (مثل N'Djamena أو المدن الكبرى المقسمة): يلزم اختيار `Arrondissement` أولاً، ثم يعرض قائمة `Quartiers` التابعة له، وإذا كان `possede_carres = 1` يعرض حقل `Carré`.
   - **خيار 3 : `Site humanitaire`**
     - يعرض دليل المواقع الإنسانية (`Camps de réfugiés`, `Sites de déplacés`, `Centres d'accueil`, `Sites de transit`) المرتبطة بالنطاق الإداري المختار دون معاملتها كبلدية مستقلة.

### 5.2. خوارزمية الإمداد المركزي والاستلام الولائي (`approvisionnement.service.ts`)
1. **الإنشاء والتخصيص (`BROUILLON` $\rightarrow$ `VALIDEE`) :**
   - ينشئ `ADMIN_CENTRAL` العملية ويحدد ولاية أو عدة ولايات في `destinations_approvisionnement`.
   - يحدد لكل ولاية على حدة كميات الأصناف المخصصة لها في `articles_approvisionnement`.
2. **الشحن (`EN_EXPEDITION`) :**
   - يمكن إصدار شحنة واحدة أو عدة شحنات (`expeditions`) لكل ولاية لتحقيق التخصيص.
   - **شرط حاسم:** إذا كانت `origine_expedition === 'ENTREPOT_CENTRAL'`، يتم خصم الكمية من مخزن الإدارة المركزية بحركة `SORTIE_EXPEDITION`. أما إذا كانت `LIVRAISON_DIRECTE_FOURNISSEUR`، فيُوثق الشحن دون خصم من مخزن مركزي غير موجود.
   - المواد المشحونة **لا تضاف** إلى `soldes_stock` في الولاية المستهدفة أثناء وجودها في الطريق.
3. **الاستلام الولائي (`receptions_provinciales`) :**
   - يسجل المندوب الولائي وصول الشحنة: `quantite_recue_physique`, `quantite_acceptee`, `quantite_endommagee`, `quantite_manquante`.
   - داخل معاملة ذرية (`db.batch`):
     - يُنشأ دفعة مخزنية (`lots_stock`) بالكمية المقبولة (`quantite_acceptee`) بحالة `BON`.
     - إذا وُجدت كمية متضررة (`quantite_endommagee > 0`)، تُسجل في دفعة منفصلة بحالة `ENDOMMAGE` (غير قابلة للحجز أو التوزيع).
     - يُحدث جدول `soldes_stock` للولاية بإضافة `quantite_acceptee` فقط إلى الرصيد المتاح.
     - إذا كان `quantite_acceptee != quantite_expediee`، تُضبط حالة الشحنة على `RECEPTIONNEE_AVEC_ECART` وحالة الإمداد على `EN_RAPPROCHEMENT` مع إشعار فوري للإدارة المركزية.

### 5.3. خوارزمية التوزيع الولائي المستقل والـ FEFO (`distribution.service.ts` & `stock.service.ts`)
1. **التحضير والفحص المسبق (`BROUILLON` $\rightarrow$ `EN_PREPARATION`) :**
   - ينشئ المندوب العملية، يحدد الشريك الممول والمنفذ، المناطق المستهدفة، قائمة المستفيدين، والمواد والحصص.
   - ينفذ النظام فحص صلاحية شامل (`verifierPreconditionsValidation`):
     - جميع المواقع والأسر تنتمي لولاية المندوب.
     - عدم وجود تكرار لنفس `menage_id` داخل نفس العملية.
     - فحص توفر المخزون في المخزن المحدد للولاية ($\text{Quantité Disponible} \ge \text{Quantité Totale Prévue}$).
2. **الاعتماد الولائي والحجز الذري (`VALIDEE_PROVINCE`) :**
   - عند ضغط المندوب على `Valider la distribution`:
   - يجلب النظام دفعات الصنف المتاحة في المخزن مرتبة حسب قاعدة **FEFO** (الأقرب انتهاءً للصلاحية أولاً: `ORDER BY CASE WHEN date_peremption IS NULL THEN 1 ELSE 0 END, date_peremption ASC`) مع استبعاد أي دفعة `etat_qualite != 'BON'` أو منتهية الصلاحية (`date_peremption < date('now')`).
   - داخل `db.batch`:
     - زيادة `quantite_reservee` في `lots_stock` و `soldes_stock`.
     - إنشاء سجلات في `reservations_stock` وحركة `RESERVATION` في `mouvements_stock`.
     - حفظ نسخة مجمدة من الخطة في `validations_distribution`.
3. **التنفيذ الميداني ومنع الصرف المكرر (`EN_EXECUTION`) :**
   - يتطلب كل طلب صرف (`POST /api/distributions/:id/remises`) ترويسة `X-Idempotency-Key`.
   - يتحقق النظام أن حالة الأسرة ليست `SERVI`.
   - داخل `db.batch`:
     - تسجيل الصرف في `remises_distribution` و `lignes_remise`.
     - تحديث حالة الأسرة (`SERVI` أو `PARTIELLEMENT_SERVI`).
     - تحويل الكمية المسلمة فعلياً من `quantite_reservee` إلى خصم فعلي من `quantite_physique` في `lots_stock` و `soldes_stock`، وتسجيل حركة `SORTIE_DISTRIBUTION`.
4. **إعلان الانتهاء والإغلاق المركزي (`TERMINEE_PROVINCE` $\rightarrow$ `CLOTUREE_CENTRAL`) :**
   - يراجع المندوب الملخص ويرفع محضر التوزيع (`PV de distribution`) ويضغط `Déclarer la distribution terminée`.
   - تراجع الإدارة المركزية الملف:
     - إما `Retourner pour correction` (يفتح سجل في `demandes_correction` ويعيد الحالة إلى `RETOURNEE_POUR_CORRECTION`).
     - أو `Clôturer la distribution`: يقوم النظام ذرياً بتحرير أي كميات محجوزة لم تُصرف ($\text{Reliquat réservé} = \text{Réservé} - \text{Consommé}$) وإعادتها إلى الرصيد المتاح في مخزن الولاية، وتجميد العملية نهائياً في `clotures_distribution`.

---

## 🎨 6. الهوية البصرية وتجربة المستخدم (UI/UX & Design System)

يجب إعداد `tailwind.config.js` ومكونات الواجهة لتعكس طابعاً مؤسسياً حكومياً وإنسانياً رفيع المستوى باللغة الفرنسية:

- **لوحة الألوان المعتمدة (Palette Institutionnelle) :**
  - الأساسي (Bleu Administratif) : `#0F3D6E` (Header, Sidebar active, Boutons primaires) و `#1E56A0` (Hover/Accents).
  - الخلفيات : `#F8FAFC` (خلفية الصفحات العامة) و `#FFFFFF` (البطاقات والجداول).
  - حالات العمليات :
    - النجاح / مكتمل (`SERVI`, `CLOTUREE`, `RECEPTIONNEE`) : أخضر زمردي `#15803D` مع خلفية `#DCFCE7`.
    - التحذير / قيد الانتظار / فروق (`EN_EXPEDITION`, `EN_RAPPROCHEMENT`, `PARTIELLEMENT_SERVI`) : كهرماني `#B45309` مع خلفية `#FEF3C7`.
    - الخطر / طلب تصحيح / مخزون حرج (`RETOURNEE_POUR_CORRECTION`, `ALERTE_STOCK`) : أحمر قرمزي `#B91C1C` مع خلفية `#FEE2E2`.
- **الخطوط والتنسيق :**
  - خط واضح وحديث (`Inter` أو `Public Sans`) مع أرقام متساوية العرض (`tabular-nums`) في جميع جداول الكميات والأرصدة.
  - دوال مساعدة موحدة في `frontend/src/utils/formatters.ts`:
    - `formaterDate(isoString)` $\rightarrow$ `new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Ndjamena', day: '2-digit', month: '2-digit', year: 'numeric' })`.
    - `formaterNombre(val)` $\rightarrow$ `new Intl.NumberFormat('fr-FR').format(val)`.
- **دعم العمل كتطبيق تقدمي (PWA) :**
  - إعداد `manifest.webmanifest` بالفرنسية (`name: "SIGAD - Gestion des Aides et Distributions"`, `short_name: "SIGAD Tchad"`, `theme_color: "#0F3D6E"`).

---

## 📅 7. مراحل التنفيذ المتسلسلة للوكيل (Step-by-Step Execution Phases)

أيها الوكيل، نفّذ المشروع على **11 مرحلة متتالية (Phase 0 إلى Phase 10)**. لا تنتقل إلى المرحلة التالية إلا بعد التأكد من نجاح اختبارات المرحلة الحالية:

### Phase 0 — Architecture et préparation
- **المهام:**
  1. تهيئة مستودع المشروع، وإعداد `wrangler.toml` لربط قاعدة بيانات `D1` وحاوية `R2`.
  2. إعداد حزم `Hono`, `Zod`, `React`, `Tailwind CSS`, `VitePWA`, `Vitest`, `Playwright`.
  3. إنشاء الثوابت المشتركة (`shared/constantes`) ومنسقات التاريخ والأرقام الفرنسية.
- **مخرج القبول:** بناء المشروع (`npm run build`) وتشغيل خادم Wrangler المحلي بنجاح.

### Phase 1 — Authentification, utilisateurs et isolation provinciale
- **المهام:**
  1. تنفيذ ملف الترحيل `0001_utilisateurs_securite.sql` وملف البذر `0008_seed_initial_data.sql` للحسابات الـ 25.
  2. بناء نظام تسجيل الدخول، تحديد محاولات الدخول الفاشلة (قفل مؤقت بعد 5 محاولات)، حماية CSRF، وإجبار تغيير كلمة المرور عند أول دخول في بيئة الإنتاج.
  3. بناء `rbac.middleware.ts` الذي يفرض العزل الولائي التام لحسابات الـ 23 ولاية.
  4. بناء واجهة تسجيل الدخول، واجهة تغيير كلمة المرور الإجبارية، ولوحة `Propriétaire` لإدارة الحسابات وسجلات التدقيق (`journaux_audit`).
- **مخرج القبول:** نجاح اختبار تسجيل الدخول لكل نوع حساب، وثبوت فشل أي طلب من مندوب ولاية (مثل `sila`) للوصول إلى بيانات ولاية أخرى (مثل `ouaddai`) بكود `403 Accès refusé`.

### Phase 2 — Référentiel territorial national (Tchad)
- **المهام:**
  1. تنفيذ ملف الترحيل `0002_referentiel_territorial.sql` وتغذيته بالولايات الـ 23، المحافظات، البلديات الحضرية والريفية، ودوائر أنجمينا العشر.
  2. بناء مسارات API للاستعلام الهرمي عن التقسيم الإداري والبلدي والمواقع الإنسانية.
  3. بناء مسار اقتراح إضافة موقع جغرافي جديد (`Village`, `Quartier`, `Site humanitaire`) من قِبل المندوب واعتماده من المركز/المالك مع التوثيق في `historique_decoupages`.
  4. بناء المكون الديناميكي `SelecteurLocalisationDynamique.tsx` الذي يطبق قواعد القرى والمدن (بـ/بدون دوائر) والمخيمات.
- **مخرج القبول:** عمل المكون الديناميكي بدقة دون إظهار حقول الدوائر للقرى أو المدن غير المقسمة.

### Phase 3 — Partenaires et bénéficiaires (Ménages & Ciblage)
- **المهام:**
  1. تنفيذ `0003_partenaires_beneficiaires.sql`.
  2. بناء دليل الشركاء الموحد (`Bailleur de fonds`, `Donateur`, `Fournisseur`, `Partenaire d'exécution`, `Transporteur`, `Gestionnaire de site`) مع آلية اقتراح شريك جديد.
  3. بناء وحدة تسجيل الأسر (`menages`) وتوليد الرمز المرجعي الفريد، وإدارة قوائم الاستهداف (`listes_beneficiaires`).
  4. بناء أداة استيراد ملفات `CSV / Excel` للأسر مع كاشف التكرار الذكي (`signalements_doublons`) الذي ينبه للتشابه دون دمج تلقائي أعمى.
- **مخرج القبول:** استيراد قائمة من 500 أسرة بكفاءة عبر `db.batch`، واكتشاف الحالات المشتبه بتكرارها، واستخراج كشف المستفيدين بالفرنسية.

### Phase 4 — Articles, entrepôts et gestion des stocks (FEFO)
- **المهام:**
  1. تنفيذ `0004_articles_et_stocks.sql` وتغذية الفئات الخمس والوحدات الأساسية.
  2. بناء إدارة المخازن المركزية والولائية (`entrepots`).
  3. بناء خدمة المخزون (`stock.service.ts`) التي تدعم الإدخال المباشر من الشركاء (`receptions_stock`), التحويلات، الجرد، التسويات، وتطبيق قاعدة **FEFO**، والفصل الصارم بين الرصيد الفعلي والمحجوز والمتاح.
- **مخرج القبول:** استحالة تسجيل حركة تؤدي إلى رصيد متاح سالب، واستبعاد الدفعات التالفة أو منتهية الصلاحية تلقائياً.

### Phase 5 — Approvisionnements centraux (Multi-provinces & Réception)
- **المهام:**
  1. تنفيذ `0005_approvisionnements_centraux.sql`.
  2. بناء واجهة ومسارات الإدارة المركزية لإنشاء عملية إمداد، اختيار عدة ولايات، وتخصيص كميات مستقلة لكل ولاية.
  3. بناء وحدة إصدار الشحنات (`expeditions`) لكل ولاية (من مخزن مركزي أو مورد خارجي مباشر).
  4. بناء وحدة الاستلام الولائي (`receptions_provinciales`) للمندوب لتسجيل الكميات المستلمة فعلياً، المقبولة، المتضررة أو الناقصة، ورفع محضر الاستلام (`PV de réception`) على Cloudflare R2.
  5. برمجة آلية المطابقة وتسوية الفوارق (`EN_RAPPROCHEMENT`) وإغلاق عملية الإمداد مركزياً.
- **مخرج القبول:** عدم زيادة مخزون الولاية عند الشحن، وزيادته بالكمية المقبولة فقط فور اعتماد الاستلام الولائي.

### Phase 6 — Distributions provinciales autonomes
- **المهام:**
  1. تنفيذ `0006_distributions_provinciales.sql`.
  2. بناء نموذج إنشاء عملية توزيع ولائية مستقلة للمندوب (تحديد الاسم، الشريك الممول والمنفذ، المنطقة المستهدفة، مصادر المواد الثلاثة: `Approvisionnement central`, `Approvisionnement direct`, `Stock existant`).
  3. بناء محرك التحقق والاعتماد الولائي (`Valider la distribution`) الذي يحجز الكميات ذرياً من المخزون المتاح ويجمد نسخة الخطة.
  4. بناء شاشة التنفيذ الميداني لتسجيل تسليم الحصص لكل أسرة (`SERVI`, `PARTIELLEMENT_SERVI`, `ABSENT`, `NON_SERVI`) مع حماية `Idempotency-Key` لمنع الصرف المكرر.
  5. بناء إجراء إعلان انتهاء العملية ولائياً (`Déclarer la distribution terminée`).
- **مخرج القبول:** نجاح دورة حياة توزيع ولائي كاملة من الإنشاء حتى إعلان الانتهاء مع خصم الكميات المسلمة فعلياً فقط.

### Phase 7 — Contrôle central, demandes de correction et clôture
- **المهام:**
  1. تنفيذ `0007_controle_et_documents.sql`.
  2. بناء لوحة الرقابة المركزية لمراجعة عمليات التوزيع المنتهية في الولايات، وإرفاق الملاحظات الرقابية (`observations_controle`).
  3. بناء مسار إرجاع الملف للتصحيح (`Retourner pour correction`) ومعالجته من قِبل المندوب.
  4. بناء مسار الإغلاق النهائي (`Clôturer la distribution`) الذي يحرر الحجوزات المتبقية غير المصروفة ويعيدها للمخزون المتاح ويقفل العملية ضد أي تعديل مباشر.
- **مخرج القبول:** ثبوت عودة الكميات المحجوزة للأسر الغائبة إلى الرصيد المتاح فور الإغلاق المركزي.

### Phase 8 — Tableaux de bord et Rapports exportables (PDF / Excel / CSV)
- **المهام:**
  1. بناء اللوحة الوطنية (`Tableau de bord national`) مع الفلاتر (الولاية، الفترة، الشريك، نوع المساعدة).
  2. بناء اللوحة الولائية (`Tableau de bord provincial`).
  3. بناء محرك توليد التقارير الـ 13 المعتمدة باللغة الفرنسية مع حساب الأعداد المجمعة دون ازدواجية (`COUNT(DISTINCT menage_id)` للأسر الفريدة مقابل إجمالي مرات الاستفادة):
     - `Rapport mensuel provincial`, `Rapport national consolidé`, `Rapport des approvisionnements`, `Rapport des réceptions`, `État des stocks`, `Rapport de distribution`, `Liste des bénéficiaires`, `Liste d'émargement`, `Procès-verbal de distribution`, `Rapport des écarts`, `Rapport de clôture`, `Rapport par partenaire`, `Rapport de couverture géographique`.
- **مخرج القبول:** تطابق أرقام التقارير المصدرة (PDF/Excel/CSV) بنسبة 100% مع السجلات الفعلية في قاعدة البيانات.

### Phase 9 — Sécurité, concurrence et optimisation Cloudflare Free Tier
- **المهام:**
  1. تنفيذ اختبارات التزامن (Concurrency Tests) للتأكد من عدم إمكانية حجز نفس الرصيد المتبقي لعمليتي توزيع في نفس اللحظة.
  2. تنفيذ مراقبة استهلاك موارد Cloudflare (عداد قراءات وكتابات D1 وحجم R2) في لوحة `Propriétaire`.
  3. التحقق من أن جميع الروابط الخاصة بملفات R2 تستخدم روابط مؤقتة موقعة أو تمر عبر Worker محمي يفحص صلاحية الولاية.

### Phase 10 — Tests de bout en bout (E2E), Sauvegardes et Réception
- **المهام:**
  1. بناء أداة التصدير والنسخ الاحتياطي المشفر لقاعدة البيانات (`Dump SQL/JSON chiffré AES-GCM`) واختبار الاستعادة (`Restore test`).
  2. تشغيل سيناريو Playwright E2E الشامل للتحقق من معايير القبول الـ 17 المنصوص عليها في الباب السادس عشر من المواصفات.

---

## ✅ 8. قائمة التحقق لمعايير القبول النهائية (17 Critères de Réception — Checklist)

يجب على الوكيل التحقق من اجتياز كل بند من البنود الـ 17 التالية قبل إعلان اكتمال المشروع:

- [ ] **1.** جميع الواجهات، التسميات، الإشعارات، والتقارير باللغة الفرنسية حصراً (بدون أي خيار لتبديل اللغة).
- [ ] **2.** الحسابات الـ 25 الأساسية (`1 Propriétaire`, `1 Administrateur central`, `23 Délégués provinciaux`) تعمل بصلاحياتها المحددة.
- [ ] **3.** كل مندوب ولائي معزول برمجياً ولا يمكنه الوصول إلا إلى بيانات ولايته فقط.
- [ ] **4.** الحساب المركزي يستطيع إنشاء عملية إمداد لولاية واحدة أو لعدة ولايات مع تخصيص مستقل لكل ولاية.
- [ ] **5.** تُسجل شحنات مستقلة لكل ولاية مع تتبع حالتها.
- [ ] **6.** المندوب الولائي يستطيع تسجيل الاستلام الفعلي، الكميات المقبولة، والفوارق أو التلفيات.
- [ ] **7.** الشحنات المرسلة وغير المستلمة لا تُضاف مطلقاً إلى المخزون المتاح للولاية قبل اعتماد استلامها.
- [ ] **8.** المندوب الولائي يستطيع إنشاء عملية توزيع مستقلة داخل ولايته وتسميتها دون انتظار تكليف مركزي.
- [ ] **9.** المندوب يستطيع تحديد الشريك الممول والمنفذ والعدد المستهدف والمنطقة الجغرافية (قرى/مدن/أحياء/مخيمات).
- [ ] **10.** المندوب يستطيع اعتماد خطة التوزيع (مع الحجز الذري للمخزون وفق FEFO) وتنفيذ الصرف وتوثيقه.
- [ ] **11.** النظام يمنع الصرف المكرر لنفس الأسرة (Idempotency) ويمنع حدوث أي كميات مخزنية سالبة.
- [ ] **12.** المندوب يستطيع مراجعة الملخص وإعلان انتهاء التنفيذ (`Déclarer la distribution terminée`).
- [ ] **13.** الإدارة المركزية تستطيع إرجاع الملف للتصحيح (`Retourner pour correction`) أو إغلاقه نهائياً (`Clôturer la distribution`).
- [ ] **14.** جميع التقارير الـ 13 والإحصاءات الوطنية والولائية تعمل وتطابق البيانات الفعلية دون ازدواجية في حساب الأسر الفريدة.
- [ ] **15.** النظام يجتاز اختبارات العزل الولائي، الأمان، والتزامن القياسي بنجاح.
- [ ] **16.** نجاح اختبارات إنشاء النسخ الاحتياطية المشفرة واستعادتها بالكامل.
- [ ] **17.** استعلامات قاعدة البيانات مفهرسة ومقسمة لصفحات (Paginated) وتعمل بكفاءة عالية ضمن حدود الخطة المجانية لـ Cloudflare (Workers + D1 + R2).