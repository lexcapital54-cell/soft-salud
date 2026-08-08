# Arquitectura ERP HealthTech — HABILISALUD

Documento del **Paso 1 ERP**: extensión del schema Prisma a 5 módulos (agenda/admisión, HCE, facturación/RIPS, auditoría de calidad, habilitación/PAMEC).

## Stack

| Capa | Tecnología |
|------|------------|
| Landing | React + Vite (`src/`) |
| App clínica / admin | Angular (`admin/`) — marca blanca Tailwind/Shadcn en Paso 4 visual |
| API | NestJS (`api/`) |
| ORM | Prisma 6 (dominio ERP); TypeORM residual en auth/clinics |
| BD | PostgreSQL `habilisalud` + JSONB |
| PDFs / firmas | `api/storage/` (`STORAGE_ROOT`) |

## Módulos

1. **Agendamiento y admisión** — máquina de estados de cita + Habeas Data (Ley 1581) antes de `IN_WAITING`; trigger de borrador HCE
2. **HCE dinámica** — plantillas JSONB, alertas clínicas, consentimientos firmados, anexos, evoluciones inmutables + notas aclaratorias, export RDA/FHIR
3. **Facturación / tesorería / RIPS** — `billingMode` (`RECEIPT_ONLY` | `FEV_MANUAL` | `FEV_API`), paquetes de sesiones, invoices + transactions
4. **Auditoría clínica y calidad** — KPIs (`QualitySnapshot`), CIE críticos (`CieCode.isCritical`), brecha de consentimientos
5. **Gestión documental / PAMEC** — requisitos/archivos, equipos, insumos, `ExpiryAlert`, checklist REPS

## Mapeo FHIR R4

| Dominio | FHIR |
|---------|------|
| Clinic | Organization |
| User | Practitioner |
| Patient | Patient |
| Appointment | Appointment |
| Encounter | Encounter |
| ClinicalRecord / evoluciones | Composition + Observation |
| Diagnosis | Condition |
| ClinicalProcedure | Procedure |
| ClinicalConsent | Consent |
| ClinicalAttachment | DocumentReference |
| Invoice / RIPS | Claim (export) |

## Flujo agenda → HCE

```text
SCHEDULED → CONFIRMED → (Habeas Data firmado) → IN_WAITING
  → crea Encounter + ClinicalRecord DRAFT
  → COMPLETED | NO_SHOW | CANCELLED
```

Modelo: `AppointmentAdmission.habeasDataSigned` (gate).

## Modelos clave (Prisma)

Fuente: [`api/prisma/schema.prisma`](../api/prisma/schema.prisma)

- Agenda: `Appointment`, `AppointmentAdmission`
- HCE: `ClinicalRecord`, `ClinicalEvolution`, `ClarificationNote`, `ClinicalAlert`, `ClinicalConsent`, `ClinicalConsentTemplate`, `ClinicalAttachment`, `RdaExport`
- Facturación: `SessionPackage`, `Invoice`, `InvoiceItem`, `Transaction`
- Calidad: `QualitySnapshot`, `CieCode.isCritical`
- Habilitación: `DocumentRequirement`/`DocumentFile`, `EquipmentResume`, `EquipmentMaintenance`, `SupplyItem`, `ExpiryAlert`, `RepsChecklist`/`RepsChecklistItem`

Migración idempotente: `api/prisma/migrations/20260808_erp_paso1_extension/migration.sql`

## Próximos pasos

- **Paso 2:** Seed CIE/CUPS ampliado + mock ingresos/egresos/atenciones
- **Paso 3:** Backend (inmutabilidad HCE, cron vencimientos, paquetes, toggle facturación)
- **Paso 4:** Frontend layout, checklist REPS, calendario, banner de alertas HCE
