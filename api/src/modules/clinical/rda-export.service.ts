import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.module';
import { ClinicalStorageService } from './clinical-storage.service';
import {
  DENTAL_ORDER_TYPE_LABELS,
  DENTAL_SERVICE_LABELS,
  DENTAL_TREATMENT_STATUS_LABELS,
} from './dentistry-labels';

/**
 * RDA — Resumen Digital de Atención (Ley 2015 / Res. 866).
 * Siempre se genera en segundo plano al firmar la HCE, aunque RIPS esté off.
 * Produce un Bundle FHIR R4 simplificado (JSON) + registro RdaExport.
 */
@Injectable()
export class RdaExportService {
  private readonly logger = new Logger(RdaExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ClinicalStorageService,
  ) {}

  /** Fire-and-forget desde el sellado de HCE. */
  enqueueAfterSign(encounterId: string) {
    void this.generateForEncounter(encounterId).catch((error) => {
      this.logger.warn(
        `RDA falló para ${encounterId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  async generateForEncounter(encounterId: string) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        clinic: true,
        patient: true,
        professional: true,
        clinicalRecord: true,
        diagnoses: true,
        procedures: true,
        patientConsents: { orderBy: { signedAt: 'desc' }, take: 3 },
      },
    });
    if (!encounter?.clinicalRecord) return null;

    const content = (encounter.clinicalRecord.content ?? {}) as Record<
      string,
      unknown
    >;
    const signature = (content.signature ?? {}) as Record<string, unknown>;
    const care = (content.careMinimum ?? {}) as Record<string, unknown>;
    const assessment = (content.assessment ?? {}) as Record<string, unknown>;
    const mental = (content.mentalExam ?? {}) as Record<string, unknown>;
    const profile = String(content.profile || '').toUpperCase();
    const specialtyTitle =
      profile === 'DENTISTRY'
        ? 'Odontología'
        : profile === 'PHYSIOTHERAPY'
          ? 'Fisioterapia'
          : 'Psicología';
    const list = (v: unknown) =>
      Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
    const allergies = list(content.allergies);
    const medications = list(content.medications);
    const clinicalNote =
      profile === 'DENTISTRY'
        ? dentalNote(care, (content.dentistry ?? {}) as Record<string, unknown>)
        : profile === 'PHYSIOTHERAPY'
          ? physioNote(care, (content.physiotherapy ?? {}) as Record<string, unknown>)
          : [
              `Motivo: ${String(care.motive || '')}`,
              `Enfermedad actual: ${String(care.presentIllness || '')}`,
              `Historia psicosocial: ${String(care.systemsReview || '')}`,
              `Antecedentes: ${String(care.antecedents || '')}`,
              `Examen mental: ${String(
                mental.narrative ||
                  [mental.appearance, mental.behavior, mental.mood, mental.thought]
                    .filter(Boolean)
                    .join('; '),
              )}`,
              `Impresión: ${String(assessment.impressionNarrative || '')}`,
              `Plan intervención: ${
                Array.isArray(assessment.managementPlan)
                  ? assessment.managementPlan.join('; ')
                  : ''
              }`,
            ];

    const patientName = [
      encounter.patient.firstName,
      encounter.patient.middleName,
      encounter.patient.lastName,
      encounter.patient.secondLastName,
    ]
      .filter(Boolean)
      .join(' ');

    const bundle = {
      resourceType: 'Bundle',
      type: 'document',
      id: `rda-${encounter.id}`,
      timestamp: new Date().toISOString(),
      meta: {
        profile: ['http://hl7.org/fhir/StructureDefinition/Bundle'],
        tag: [{ system: 'urn:habilisalud:rda', code: 'Res.866' }],
      },
      entry: [
        {
          resource: {
            resourceType: 'Composition',
            status: 'final',
            type: {
              coding: [
                {
                  system: 'http://loinc.org',
                  code: '11506-3',
                  display: 'Progress note',
                },
              ],
              text: `Resumen Digital de Atención — ${specialtyTitle}`,
            },
            subject: { reference: `Patient/${encounter.patientId}` },
            encounter: { reference: `Encounter/${encounter.id}` },
            date: encounter.clinicalRecord.signedAt?.toISOString(),
            author: [
              {
                display: encounter.professional.fullName,
                identifier: encounter.professional.professionalCard
                  ? { value: encounter.professional.professionalCard }
                  : undefined,
              },
            ],
            title: 'RDA HABILISALUD',
            section: [
              {
                title: 'Admisión',
                text: {
                  status: 'generated',
                  div: `<div>${escapeHtml(
                    [
                      `Paciente: ${patientName}`,
                      `Doc: ${encounter.patient.documentType || ''} ${
                        encounter.patient.documentNumber || ''
                      }`,
                      `Consultorio: ${encounter.clinic.name}`,
                      `Sede: ${encounter.location || encounter.clinic.address || ''}`,
                      `Modalidad: ${encounter.modality}`,
                      `Finalidad: ${encounter.purpose || 'N/A (particular)'}`,
                      `Causa externa: ${encounter.externalCause || 'N/A'}`,
                    ].join(' · '),
                  )}</div>`,
                },
              },
              {
                title: 'Nota clínica',
                text: {
                  status: 'generated',
                  div: `<div>${escapeHtml(clinicalNote.filter(Boolean).join('\n'))}</div>`,
                },
              },
              {
                title: 'Alergias',
                text: {
                  status: 'generated',
                  div: `<div>${escapeHtml(allergies.join(' | ') || 'Sin registro')}</div>`,
                },
              },
              {
                title: 'Medicamentos',
                text: {
                  status: 'generated',
                  div: `<div>${escapeHtml(medications.join(' | ') || 'Sin registro')}</div>`,
                },
              },
              {
                title: 'Diagnósticos CIE-10',
                text: {
                  status: 'generated',
                  div: `<div>${escapeHtml(
                    encounter.diagnoses
                      .map((d) => `${d.cieCode} ${d.description} (${d.type})`)
                      .join(' | ') || 'Sin CIE (consulta particular)',
                  )}</div>`,
                },
              },
              {
                title: 'Procedimientos CUPS',
                text: {
                  status: 'generated',
                  div: `<div>${escapeHtml(
                    encounter.procedures
                      .map((p) => `${p.cupsCode} ${p.description}`)
                      .join(' | ') || 'Sin procedimientos',
                  )}</div>`,
                },
              },
              {
                title: 'Inmutabilidad',
                text: {
                  status: 'generated',
                  div: `<div>${escapeHtml(
                    [
                      `Hash: ${encounter.clinicalRecord.contentHash || ''}`,
                      `Código: ${encounter.clinicalRecord.verificationCode || ''}`,
                      `Firma: ${String(signature.professionalName || '')}`,
                      `TP: ${String(signature.professionalCard || '')}`,
                    ].join(' · '),
                  )}</div>`,
                },
              },
            ],
          },
        },
        {
          resource: {
            resourceType: 'Patient',
            id: encounter.patientId,
            name: [{ text: patientName }],
            birthDate: encounter.patient.birthDate
              ? encounter.patient.birthDate.toISOString().slice(0, 10)
              : undefined,
            identifier: encounter.patient.documentNumber
              ? [
                  {
                    system: 'urn:co:document',
                    value: `${encounter.patient.documentType}:${encounter.patient.documentNumber}`,
                  },
                ]
              : [],
            extension: encounter.patient.guardianFullName
              ? [
                  {
                    url: 'urn:habilisalud:acudiente',
                    valueString: [
                      encounter.patient.guardianFullName,
                      encounter.patient.guardianDocumentNumber,
                      encounter.patient.guardianRelationship,
                      encounter.patient.guardianPhone,
                    ]
                      .filter(Boolean)
                      .join(' | '),
                  },
                ]
              : [],
          },
        },
        {
          resource: {
            resourceType: 'Encounter',
            id: encounter.id,
            status: 'finished',
            class: {
              code: encounter.modality === 'VIRTUAL' ? 'VR' : 'AMB',
            },
            identifier: encounter.externalCode
              ? [{ value: encounter.externalCode }]
              : [],
          },
        },
      ],
    };

    const json = Buffer.from(JSON.stringify(bundle, null, 2), 'utf8');
    const verificationCode =
      encounter.clinicalRecord.verificationCode ||
      `RDA-${createHash('sha256').update(json).digest('hex').slice(0, 12).toUpperCase()}`;

    const written = await this.storage.writeBuffer(
      `rda/${encounter.clinicId}/${encounter.id}`,
      `rda_${encounter.id}.json`,
      json,
      'application/fhir+json',
    );

    const row = await this.prisma.rdaExport.create({
      data: {
        encounterId: encounter.id,
        fhirStorageKey: written.storageKey,
        verificationCode,
        status: 'GENERATED',
        generatedAt: new Date(),
      },
    });

    this.logger.log(
      `RDA generado encounter=${encounter.id} key=${written.storageKey}`,
    );
    return row;
  }

  /**
   * JSON financiero RIPS (Res. 2275) — solo si el profesional lo habilita.
   * Se adjunta metadata al encounter vía audit; no bloquea el sellado.
   */
  async generateRipsIfEnabled(encounterId: string, professionalRipsEnabled: boolean) {
    if (!professionalRipsEnabled) return null;

    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        clinic: true,
        patient: true,
        professional: true,
        diagnoses: true,
        procedures: true,
        clinicalRecord: true,
      },
    });
    if (!encounter) return null;
    // Con módulo RIPS ON: genera JSON financiero. El checkbox por atención
    // (generateRips) permite omitir una cita puntual.
    if (!encounter.generateRips) return null;

    const rips = {
      tipoNota: 'AC',
      usuarios: [
        {
          tipoDocumentoIdentificacion: encounter.patient.documentType || 'CC',
          numDocumentoIdentificacion: encounter.patient.documentNumber || '',
          tipoUsuario: encounter.patient.userType || 'PARTICULAR',
          fechaNacimiento: encounter.patient.birthDate
            ?.toISOString()
            .slice(0, 10),
          codSexo: encounter.patient.sexAtBirth || '',
          codMunicipioResidencia: encounter.patient.municipalityCode || '',
          codZonaTerritorialResidencia: encounter.patient.residenceZone || 'URBANA',
          consultorio: encounter.clinic.name,
          finalidadTecnologiaSalud: encounter.purpose || '02',
          causaMotivoAtencion: encounter.externalCause || '15',
          codDiagnosticoPrincipal:
            encounter.diagnoses.find((d) => d.type === 'PRINCIPAL')?.cieCode ||
            encounter.diagnoses[0]?.cieCode ||
            '',
          procedimientos: encounter.procedures.map((p) => ({
            codPrestador: encounter.clinic.id.slice(0, 12),
            fechaInicioAtencion: encounter.startedAt?.toISOString().slice(0, 10),
            codProcedimiento: p.cupsCode,
            descripcion: p.description,
          })),
        },
      ],
      meta: {
        encounterId: encounter.id,
        externalCode: encounter.externalCode,
        generatedAt: new Date().toISOString(),
        norm: 'Res.2275/2023',
      },
    };

    const buffer = Buffer.from(JSON.stringify(rips, null, 2), 'utf8');
    const written = await this.storage.writeBuffer(
      `rips/${encounter.clinicId}/${encounter.id}`,
      `rips_${encounter.id}.json`,
      buffer,
      'application/json',
    );

    await this.prisma.auditLog.create({
      data: {
        clinicId: encounter.clinicId,
        userId: encounter.professionalId,
        action: 'CREATE',
        entityType: 'RipsExport',
        entityId: encounter.id,
        metadata: { storageKey: written.storageKey },
      },
    });

    this.logger.log(`RIPS generado encounter=${encounter.id}`);
    return written.storageKey;
  }
}

function text(v: unknown) {
  return typeof v === 'string' ? v.trim() : '';
}

function rowsOf(v: unknown) {
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
}

function physioNote(care: Record<string, unknown>, physio: Record<string, unknown>) {
  return [
    `Motivo: ${text(care.motive)}`,
    `Enfermedad actual: ${text(care.presentIllness)}`,
    `Hallazgos: ${text(physio.findings)}`,
    `Diagnóstico fisioterapéutico: ${text(physio.physioDiagnosis)}`,
    `Objetivos: ${text(physio.treatmentObjectives)}`,
    `Plan de intervención: ${text(physio.interventionPlan)}`,
  ];
}

function dentalNote(care: Record<string, unknown>, dental: Record<string, unknown>) {
  const plan = rowsOf(dental.treatmentPlan)
    .filter((r) => text(r.description) || text(r.code))
    .map((r) =>
      [
        text(r.tooth) && `Pieza ${text(r.tooth)}`,
        text(r.code),
        text(r.description),
        DENTAL_TREATMENT_STATUS_LABELS[text(r.status)] || '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  const rx = rowsOf(dental.prescriptions)
    .filter((r) => text(r.medication))
    .map((r) =>
      [r.medication, r.dose, r.route, r.frequency, r.duration].map(text).filter(Boolean).join(' '),
    );
  const orders = rowsOf(dental.orders)
    .filter((r) => text(r.detail) || text(r.type))
    .map((r) =>
      [DENTAL_ORDER_TYPE_LABELS[text(r.type)] || text(r.type), text(r.code), text(r.detail)]
        .filter(Boolean)
        .join(' '),
    );
  return [
    `Servicio: ${DENTAL_SERVICE_LABELS[text(dental.service)] || ''}`,
    `Motivo: ${text(care.motive)}`,
    `Enfermedad actual: ${text(dental.currentIllness)}`,
    plan.length ? `Plan de tratamiento: ${plan.join('; ')}` : '',
    rx.length ? `Prescripción: ${rx.join('; ')}` : '',
    orders.length ? `Órdenes: ${orders.join('; ')}` : '',
  ];
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
