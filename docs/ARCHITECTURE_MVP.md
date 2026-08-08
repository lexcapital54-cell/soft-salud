# Arquitectura MVP — HABILISALUD

Documento del **Paso 1**: arquitectura, base de datos y storage.

## Stack

| Capa | Tecnología |
|------|------------|
| Landing | React + Vite (`src/`) |
| App clínica / admin | Angular (`admin/`) |
| API | NestJS (`api/`) |
| ORM | Prisma 6 (fuente de verdad del modelo clínico) |
| BD | PostgreSQL `habilisalud` + JSONB |
| PDFs | Storage local `api/storage/` (interfaz lista para S3) |
| Generación PDF | `pdfmake` / `pdf-lib` (Paso 3) |
| Visor PDF | Angular + blob/iframe o visor dedicado (Paso 4) |

Auth y clinics actuales (TypeORM) se mantienen; el dominio clínico (agenda, HCE, RDA, documentos) avanza sobre Prisma en la misma BD.

## Módulos

1. **Agendamiento** — `Appointment` con estados y vínculo a `Encounter`
2. **HCE dinámica** — `FormTemplate.schemaJson` + `ClinicalRecord.content` (JSONB); export PDF legal con bloque RDA + JSON HL7 FHIR R4
3. **Gestión documental** — `DocumentRequirement` / `DocumentFile` con upload, download y visor

## Estructura relevante

```text
api/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/          # se generan al migrar
│   └── seed/
│       └── catalogs/        # CIE/CUPS (Paso 2, desde Excel)
├── storage/                 # gitignored (salvo .gitkeep)
│   ├── clinical-exports/
│   ├── rda-json/
│   ├── habilitation-docs/
│   └── clinical-attachments/
└── src/
    ├── auth/, clinics/, users/   # existentes
    └── modules/                  # patients, appointments, clinical, rda, documents (Pasos 3–4)
```

## Flujo de dominio

```text
Appointment --iniciar atención--> Encounter
Encounter --> ClinicalRecord (JSONB)
ClinicalRecord --> Diagnosis (CIE) + ClinicalProcedure (CUPS)
Cerrar HCE --> RdaExport (PDF + FHIR JSON)
DocumentRequirement --> DocumentFile (PDF habilitación)
```

## Convención `ClinicalRecord.content` (Psicología MVP)

- `careMinimum`: motive, presentIllness, antecedents, systemsReview
- `mentalExam`: appearance, behavior, speech, mood, affect, thought, perception, judgment, insight
- `assessment`: impressionNarrative, observations, managementPlan[]
- `vitals`, `allergies`, `medications`, `risks`
- `rdaMeta`: includedEvents[], deviceId, physicalLocation

Otras especialidades (medicina, estética, odontología) usan el mismo contenedor JSONB con `FormTemplate` distinto.

## Storage

| Tipo | `storageKey` ejemplo |
|------|----------------------|
| Docs habilitación | `habilitation-docs/{clinicId}/{requirementId}/{fileId}.pdf` |
| PDF HCE + RDA | `clinical-exports/{clinicId}/{encounterId}/hce-rda.pdf` |
| FHIR Bundle | `rda-json/{clinicId}/{encounterId}/bundle.json` |
| Anexos clínicos | `clinical-attachments/{encounterId}/{fileId}` |

Variables:

- `DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/habilisalud`
- `STORAGE_ROOT=./storage`

## Esquema Prisma

Fuente de verdad: [`api/prisma/schema.prisma`](../api/prisma/schema.prisma).

Modelos principales: `Clinic`, `User`, `Patient`, `Appointment`, `FormTemplate`, `Encounter`, `ClinicalRecord`, `Diagnosis`, `ClinicalProcedure`, `Consent`, `ClinicalAttachment`, `RdaExport`, `CieCode`, `CupsCode`, `DocumentCategory`, `DocumentRequirement`, `DocumentFile`, `AuditLog`.

## Próximos pasos

- **Paso 2 (hecho):** Seed CIE/CUPS MVP psicología + requisitos documentales desde `Checklist_Habilitacion_Consultorio_Psicologico_Base2.xlsx` (`npm run prisma:seed` en `api/`)
- **Paso 3:** Servicios Nest (formularios, RDA PDF/FHIR, upload PDF)
- **Paso 4:** UI Angular (agenda, HCE dinámica, dashboard documental + visor)

### Nota catálogos

El Excel de habilitación **no incluye** hojas CIE/CUPS. El seed usa:

- `api/prisma/seed/catalogs/cie-psychology.json` (30 códigos)
- `api/prisma/seed/catalogs/cups-psychology.json` (15 códigos)
- Requisitos: 12 categorías / ~189 documentos del checklist, replicados por clínica activa

Cuando exista un Excel oficial CIE/CUPS completo, se reemplazan esos JSON.
