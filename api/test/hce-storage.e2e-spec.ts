/**
 * Prueba de almacenamiento de la historia clínica (HCE) contra una base de datos DESECHABLE.
 *
 * Verifica, leyendo directamente la base de datos, que se guardan:
 *  - los datos del paciente, la atención y todo el contenido de la historia,
 *  - la firma del profesional (perfil, historia sellada y consentimiento),
 *  - la firma del paciente (consentimiento presencial y firma remota),
 *  - el envío del enlace de la consulta virtual (notification_logs).
 *
 * Ejecutar con `npm run test:hce` (levanta y destruye la base de pruebas).
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isDeepStrictEqual } from 'util';
import request from 'supertest';

// `archiver` es ESM puro y Jest no lo carga; solo se usa para exportar ZIP, que esta prueba no cubre.
jest.mock('archiver', () => () => {
  throw new Error('archiver no está disponible en esta prueba');
});

const TEST_DB = process.env.TEST_DATABASE_URL ?? '';

function assertThrowawayDatabase(url: string) {
  const parsed = url ? new URL(url) : null;
  const local = parsed && ['127.0.0.1', 'localhost'].includes(parsed.hostname);
  const name = parsed?.pathname.replace('/', '') ?? '';
  if (!parsed || !local || !/test/i.test(name)) {
    throw new Error(
      'TEST_DATABASE_URL debe apuntar a una base LOCAL cuyo nombre contenga "test". ' +
        'Esta prueba nunca se ejecuta contra producción.',
    );
  }
  return parsed;
}

const db = assertThrowawayDatabase(TEST_DB);
const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hce-test-storage-'));
Object.assign(process.env, {
  DATABASE_URL: TEST_DB,
  DB_HOST: db.hostname,
  DB_PORT: db.port || '5432',
  DB_USERNAME: decodeURIComponent(db.username),
  DB_PASSWORD: decodeURIComponent(db.password),
  DB_NAME: db.pathname.replace('/', ''),
  JWT_SECRET: 'hce-storage-test-secret',
  SUPERADMIN_EMAIL: 'superadmin@hce-test.local',
  SUPERADMIN_PASSWORD: 'SuperTest123!',
  SUPERADMIN_NAME: 'Superadmin Pruebas',
  STORAGE_ROOT: storageRoot,
  NOTIFICATIONS_ENABLED: 'false',
  SMTP_HOST: '',
  PUBLIC_APP_URL: 'http://localhost:4200',
});

// Firmas ficticias (PNG 1x1) distintas para poder distinguir quién firmó qué.
const PROFESSIONAL_SIGNATURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PATIENT_SIGNATURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const REMOTE_PATIENT_SIGNATURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const MEETING_URL = 'https://meet.habilisalud-test.local/sala-hce-0001';

type Check = { section: string; field: string; expected: string; stored: string; ok: boolean };
const report: Check[] = [];

function short(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const text = value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > 70 ? `${text.slice(0, 67)}…` : text;
}

/** Registra la comparación en el informe y la valida. */
function check(section: string, field: string, stored: unknown, expected: unknown) {
  const ok = isDeepStrictEqual(stored, expected);
  report.push({ section, field, expected: short(expected), stored: short(stored), ok });
  expect({ field, stored }).toEqual({ field, stored: expected });
}

function checkPresent(section: string, field: string, stored: unknown) {
  const ok = stored !== null && stored !== undefined && stored !== '';
  report.push({ section, field, expected: '(con valor)', stored: short(stored), ok });
  expect({ field, present: ok }).toEqual({ field, present: true });
}

async function waitFor<T>(fn: () => Promise<T | null>, label: string, timeoutMs = 8000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Tiempo agotado esperando: ${label}`);
}

describe('Almacenamiento de la historia clínica (base de pruebas)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: ReturnType<typeof request>;
  let proToken = '';
  let professionalId = '';
  let clinicId = '';
  let patientId = '';
  let encounterId = '';
  let templateIds: string[] = [];
  let saToken = '';

  const auth = () => ({ Authorization: `Bearer ${proToken}` });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB } } });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { seedConsents } = require('../prisma/seed/seedConsents');
    await seedConsents(prisma);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    http = request(app.getHttpServer());

    const sa = await http
      .post('/api/auth/login')
      .send({ email: process.env.SUPERADMIN_EMAIL, password: process.env.SUPERADMIN_PASSWORD })
      .expect(201);
    saToken = sa.body.accessToken;
    const saAuth = { Authorization: `Bearer ${saToken}` };

    const clinic = await http
      .post('/api/clinics')
      .set(saAuth)
      .send({
        name: 'Consultorio Pruebas HCE',
        specialty: 'PSYCHOLOGY',
        admin: { fullName: 'Admin Pruebas', email: 'admin@hce-test.local', password: 'AdminTest123!' },
      })
      .expect(201);
    clinicId = clinic.body.id;

    const pro = await http
      .post('/api/users/staff')
      .set(saAuth)
      .send({
        clinicId,
        fullName: 'Psicóloga Pruebas',
        email: 'psicologa@hce-test.local',
        password: 'ProTest123!',
        role: 'HEALTH_PROFESSIONAL',
        professionalCard: 'TP-TEST-0001',
      })
      .expect(201);
    professionalId = pro.body.id;

    const login = await http
      .post('/api/auth/login')
      .send({ email: 'psicologa@hce-test.local', password: 'ProTest123!' })
      .expect(201);
    proToken = login.body.accessToken;

    const templates = await prisma.consentTemplate.findMany({
      where: { specialty: 'PSYCHOLOGY', isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true },
    });
    templateIds = templates.map((t) => t.id);
    expect(templateIds.length).toBeGreaterThanOrEqual(2);
  }, 60000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    fs.rmSync(storageRoot, { recursive: true, force: true });
    printReport();
  });

  it('guarda la firma del profesional en su perfil', async () => {
    await http.put('/api/me/professional-signature').set(auth()).send({ signatureBase64: PROFESSIONAL_SIGNATURE }).expect((r) => {
      expect([200, 201]).toContain(r.status);
    });
    const user = await prisma.user.findUnique({ where: { id: professionalId } });
    check('Profesional', 'users.professional_signature_base64', user?.professionalSignatureBase64, PROFESSIONAL_SIGNATURE);
    check('Profesional', 'users.professional_card', user?.professionalCard, 'TP-TEST-0001');
  });

  it('guarda todos los datos del paciente', async () => {
    const sent = {
      documentType: 'CC',
      documentNumber: '9000000001',
      firstName: 'Paciente',
      middleName: 'De',
      lastName: 'Prueba',
      secondLastName: 'Ficticio',
      birthDate: '1990-05-17',
      sexAtBirth: 'F',
      address: 'Calle Falsa 123',
      city: 'Manizales',
      department: 'Caldas',
      municipalityCode: '17001',
      phone: '3000000001',
      email: 'paciente@hce-test.local',
      eps: 'EPS Pruebas',
      occupation: 'Docente',
      emergencyContactName: 'Contacto Prueba',
      emergencyContactPhone: '3000000002',
      emergencyRelationship: 'Hermano',
    };
    const res = await http.post('/api/patients').set(auth()).send(sent).expect(201);
    patientId = res.body.id;
    const row = await prisma.patient.findUnique({ where: { id: patientId } });
    const stored = row as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(sent)) {
      const got = stored[key] instanceof Date ? (stored[key] as Date).toISOString().slice(0, 10) : stored[key];
      check('Paciente', `patients.${key}`, got, value);
    }
    check('Paciente', 'patients.clinic_id', row?.clinicId, clinicId);
  });

  it('crea la atención con su historia en borrador y los consentimientos', async () => {
    const res = await http.post('/api/encounters').set(auth()).send({ patientId, modality: 'IN_PERSON' }).expect(201);
    encounterId = res.body.id;
    const enc = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: { clinicalRecord: true, consents: true },
    });
    check('Atención', 'encounters.patient_id', enc?.patientId, patientId);
    check('Atención', 'encounters.professional_id', enc?.professionalId, professionalId);
    check('Atención', 'encounters.modality', enc?.modality, 'IN_PERSON');
    checkPresent('Atención', 'encounters.external_code', enc?.externalCode);
    check('Historia', 'clinical_records.status (inicial)', enc?.clinicalRecord?.status, 'DRAFT');
    check(
      'Consentimientos',
      'consents (tipos creados)',
      enc?.consents.map((c) => c.consentType).sort(),
      ['DATA_PROCESSING', 'INFORMED'],
    );
  });

  it('guarda todo el contenido de la historia, diagnósticos y procedimientos', async () => {
    const content = {
      careMinimum: {
        motive: 'Ansiedad persistente desde hace 3 meses',
        currentIllness: 'Refiere insomnio, preocupación excesiva y tensión muscular.',
      },
      background: { personal: 'Niega patologías', family: 'Madre con depresión', allergies: 'Ninguna conocida' },
      mentalExam: { appearance: 'Adecuada', mood: 'Ansioso', thought: 'Coherente', orientation: 'Orientada x3' },
      assessment: { impressionNarrative: 'Cuadro compatible con trastorno de ansiedad generalizada.' },
      plan: { goals: ['Reducir ansiedad', 'Higiene del sueño'], sessions: 8, nextControl: '2026-10-16' },
      notes: 'Texto con tildes y ñ: acción, niño, corazón — “comillas” y emojis 🙂',
    };
    const diagnoses = [
      { cieCode: 'F411', description: 'Trastorno de ansiedad generalizada', type: 'PRINCIPAL' },
      { cieCode: 'G470', description: 'Trastornos del inicio y del mantenimiento del sueño', type: 'RELATED' },
    ];
    const procedures = [{ cupsCode: '890208', description: 'Consulta de primera vez por psicología' }];

    await http
      .put(`/api/clinical-records/${encounterId}`)
      .set(auth())
      .send({ content, diagnoses, procedures, noteFormat: 'FULL' })
      .expect((r) => expect([200, 201]).toContain(r.status));

    const record = await prisma.clinicalRecord.findUnique({ where: { encounterId } });
    const stored = (record?.content ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(content)) {
      check('Historia', `content.${key}`, stored[key], value);
    }
    const dx = await prisma.diagnosis.findMany({ where: { encounterId }, orderBy: { cieCode: 'asc' } });
    check(
      'Historia',
      'diagnoses (CIE-10)',
      dx.map((d) => ({ cieCode: d.cieCode, description: d.description, type: d.type })),
      diagnoses,
    );
    const px = await prisma.clinicalProcedure.findMany({ where: { encounterId } });
    check('Historia', 'clinical_procedures (CUPS)', px.map((p) => ({ cupsCode: p.cupsCode, description: p.description })), procedures);
    const audit = await prisma.auditLog.count({ where: { entityType: 'ClinicalRecord', action: 'UPDATE' } });
    check('Historia', 'audit_logs (UPDATE registrado)', audit > 0, true);
  });

  it('guarda la firma del paciente en el consentimiento presencial', async () => {
    const res = await http
      .post('/api/patient-consents')
      .set(auth())
      .send({
        patientId,
        encounterId,
        templateId: templateIds[0],
        signatureBase64: PATIENT_SIGNATURE,
        signerRole: 'PATIENT',
        signerName: 'Paciente De Prueba Ficticio',
        signerDocumentType: 'CC',
        signerDocument: '9000000001',
        professionalSignatureBase64: PROFESSIONAL_SIGNATURE,
      })
      .expect(201);
    const consent = await prisma.patientConsent.findUnique({ where: { id: res.body.id } });
    check('Consentimiento presencial', 'patient_consents.signature_base64 (paciente)', consent?.signatureBase64, PATIENT_SIGNATURE);
    check(
      'Consentimiento presencial',
      'patient_consents.professional_signature_base64',
      consent?.professionalSignatureBase64,
      PROFESSIONAL_SIGNATURE,
    );
    check('Consentimiento presencial', 'patient_consents.signer_name', consent?.signerName, 'Paciente De Prueba Ficticio');
    check('Consentimiento presencial', 'patient_consents.signer_document', consent?.signerDocument, 'CC 9000000001');
    checkPresent('Consentimiento presencial', 'patient_consents.signed_at', consent?.signedAt);
    checkPresent('Consentimiento presencial', 'patient_consents.content_hash', consent?.contentHash);
    checkPresent('Consentimiento presencial', 'patient_consents.pdf_storage_key', consent?.pdfStorageKey);

    const record = await prisma.clinicalRecord.findUnique({ where: { encounterId } });
    const draft = ((record?.content ?? {}) as Record<string, any>).consentDraft ?? {};
    check('Consentimiento presencial', 'content.consentDraft.patientSignatureBase64', draft.patientSignatureBase64, PATIENT_SIGNATURE);
  });

  it('envía el enlace de firma remota y guarda la firma del paciente', async () => {
    const invite = await http
      .post('/api/patient-consents/remote-invite')
      .set(auth())
      .send({ patientId, encounterId, templateId: templateIds[1] })
      .expect(201);
    const link: string = invite.body.link;
    checkPresent('Firma remota', 'enlace de firma generado', link);
    const token = new URL(link).searchParams.get('token') ?? '';
    check('Firma remota', 'enlace apunta a la página pública de firma', link.includes('/firmar-consentimiento.html?token='), true);

    const row = await prisma.remoteConsentInvite.findFirst({ where: { encounterId }, orderBy: { createdAt: 'desc' } });
    check('Firma remota', 'remote_consent_invites.status (enviado)', row?.status, 'PENDING');
    check('Firma remota', 'remote_consent_invites.sent_to_email', row?.sentToEmail, 'paciente@hce-test.local');

    await http
      .post(`/api/public/remote-consent/${encodeURIComponent(token)}/sign`)
      .send({ signatureBase64: REMOTE_PATIENT_SIGNATURE })
      .expect((r) => expect([200, 201]).toContain(r.status));

    const used = await prisma.remoteConsentInvite.findUnique({ where: { id: row!.id } });
    check('Firma remota', 'remote_consent_invites.status (firmado)', used?.status, 'SIGNED');
    const consent = await prisma.patientConsent.findUnique({ where: { id: used!.patientConsentId! } });
    check('Firma remota', 'patient_consents.signature_base64 (paciente remoto)', consent?.signatureBase64, REMOTE_PATIENT_SIGNATURE);
    const enc = await prisma.encounter.findUnique({ where: { id: encounterId } });
    check('Firma remota', 'encounters.modality (pasa a virtual)', enc?.modality, 'VIRTUAL');
  });

  it('sella la historia con la firma del profesional', async () => {
    await http
      .post(`/api/clinical-records/${encounterId}/sign`)
      .set(auth())
      .send({})
      .expect((r) => expect([200, 201]).toContain(r.status));
    const record = await prisma.clinicalRecord.findUnique({ where: { encounterId } });
    const signature = ((record?.content ?? {}) as Record<string, any>).signature ?? {};
    check('Historia sellada', 'clinical_records.status', record?.status, 'SIGNED');
    checkPresent('Historia sellada', 'clinical_records.content_hash', record?.contentHash);
    checkPresent('Historia sellada', 'clinical_records.verification_code', record?.verificationCode);
    checkPresent('Historia sellada', 'clinical_records.signed_at', record?.signedAt);
    check('Historia sellada', 'content.signature.signatureBase64 (profesional)', signature.signatureBase64, PROFESSIONAL_SIGNATURE);
    check('Historia sellada', 'content.signature.professionalName', signature.professionalName, 'Psicóloga Pruebas');
    check('Historia sellada', 'content.signature.professionalCard', signature.professionalCard, 'TP-TEST-0001');
    check(
      'Historia sellada',
      'content.consentDraft.patientSignatureBase64 (última firma del paciente)',
      ((record?.content ?? {}) as any).consentDraft?.patientSignatureBase64,
      REMOTE_PATIENT_SIGNATURE,
    );
    const enc = await prisma.encounter.findUnique({ where: { id: encounterId } });
    check('Historia sellada', 'encounters.status', enc?.status, 'FINISHED');
  });

  it('al registrar el pago queda una copia del recibo en la carpeta del consultorio', async () => {
    const sa = { Authorization: `Bearer ${saToken}` };
    const created = await http
      .post('/api/platform-billing/receipts')
      .set(sa)
      .send({ clinicId, kind: 'MONTHLY_HOSTING', plan: 'WITH_DOCS', amount: 150000, periodMonth: '2026-10', status: 'PENDING' })
      .expect(201);
    let row = await prisma.platformReceipt.findUnique({ where: { id: created.body.id } });
    check('Recibos HabiliSALUD', 'cobro pendiente sin copia archivada', row?.pdfStorageKey ?? null, null);

    const adminLogin = await http.post('/api/auth/login').send({ email: 'admin@hce-test.local', password: 'AdminTest123!' }).expect(201);
    const admin = { Authorization: `Bearer ${adminLogin.body.accessToken}` };
    const before = await http.get('/api/me/platform-receipts').set(admin).expect(200);
    check('Recibos HabiliSALUD', 'carpeta vacía mientras está pendiente', before.body.length, 0);

    await http.post(`/api/platform-billing/receipts/${created.body.id}/mark-paid`).set(sa).send({}).expect(201);
    row = await prisma.platformReceipt.findUnique({ where: { id: created.body.id } });
    check('Recibos HabiliSALUD', 'platform_receipts.status', row?.status, 'PAID');
    check('Recibos HabiliSALUD', 'platform_receipts.pdf_storage_key', row?.pdfStorageKey, `platform-receipts/${clinicId}/${row?.number}.pdf`);
    const stored = await prisma.storedFile.findUnique({ where: { storageKey: row!.pdfStorageKey! } });
    check('Recibos HabiliSALUD', 'stored_files: copia PDF guardada', stored ? Buffer.from(stored.data).subarray(0, 4).toString() : null, '%PDF');

    const folder = await http.get('/api/me/platform-receipts').set(admin).expect(200);
    check('Recibos HabiliSALUD', 'carpeta del consultorio muestra el recibo', folder.body.map((r: { number: string }) => r.number), [row?.number]);
    const pdf = await http.get(`/api/me/platform-receipts/${created.body.id}/pdf`).set(admin).buffer(true).expect(200);
    check('Recibos HabiliSALUD', 'el consultorio descarga su copia', (pdf.body as Buffer).subarray(0, 4).toString(), '%PDF');
    await http.get('/api/me/platform-receipts').set(auth()).expect(403);
  });

  it('solo HABILISALUD (superadmin) habilita RIPS y aplica a todo el consultorio', async () => {
    const adminLogin = await http.post('/api/auth/login').send({ email: 'admin@hce-test.local', password: 'AdminTest123!' }).expect(201);
    const admin = { Authorization: `Bearer ${adminLogin.body.accessToken}` };
    const sa = { Authorization: `Bearer ${saToken}` };

    await http.post('/api/me/rips-settings').set(auth()).send({ ripsEnabled: true }).expect(403);
    await http.post('/api/me/rips-settings').set(admin).send({ ripsEnabled: true }).expect(403);
    await http.post(`/api/clinics/${clinicId}/rips`).set(admin).send({ ripsEnabled: true }).expect(403);
    let pro = await prisma.user.findUnique({ where: { id: professionalId } });
    check('RIPS', 'ni el profesional ni el admin del consultorio pueden activarlo', pro?.ripsEnabled, false);

    await http.post(`/api/clinics/${clinicId}/rips`).set(sa).send({ ripsEnabled: true }).expect(201);
    pro = await prisma.user.findUnique({ where: { id: professionalId } });
    check('RIPS', 'users.rips_enabled del profesional (activado por HABILISALUD)', pro?.ripsEnabled, true);
    const seen = await http.get('/api/me/rips-settings').set(auth()).expect(200);
    check('RIPS', 'el profesional ve RIPS activado', seen.body.ripsEnabled, true);
    const list = await http.get('/api/clinics').set(sa).expect(200);
    check('RIPS', 'el panel de HABILISALUD muestra RIPS activo', list.body.find((c: { id: string }) => c.id === clinicId)?.ripsEnabled, true);

    await http.post(`/api/clinics/${clinicId}/rips`).set(sa).send({ ripsEnabled: false }).expect(201);
    pro = await prisma.user.findUnique({ where: { id: professionalId } });
    check('RIPS', 'users.rips_enabled del profesional (desactivado por HABILISALUD)', pro?.ripsEnabled, false);
  });

  it('el profesional crea su asistente administrativo: agenda y recibos, sin historia clínica', async () => {
    const created = await http.post('/api/me/assistants').set(auth()).send({
      fullName: 'Asistente Prueba',
      email: 'asistente@hce-test.local',
      password: '4821',
    }).expect(201);
    await http.post('/api/me/assistants').set(auth()).send({ fullName: 'X', email: 'x@hce-test.local', password: 'Asistente123!' }).expect(400);
    const row = await prisma.user.findUnique({ where: { id: created.body.id } });
    check('Asistente', 'rol y consultorio', [row?.role, row?.clinicId], ['RECEPTIONIST', clinicId]);
    check('Asistente', 'la respuesta no expone la contraseña', JSON.stringify(created.body).includes('4821'), false);

    const login = await http.post('/api/auth/login').send({ email: 'asistente@hce-test.local', password: '4821' }).expect(201);
    const asis = { Authorization: `Bearer ${login.body.accessToken}` };
    await http.get('/api/appointments/today').set(asis).expect(200);
    await http.get('/api/billing/receipts').set(asis).expect(200);
    await http.get(`/api/encounters/for-patient/${patientId}`).set(asis).expect(403);
    await http.post('/api/me/assistants').set(asis).send({ fullName: 'Otro', email: 'otro@hce-test.local', password: '1234' }).expect(403);

    const list = await http.get('/api/me/assistants').set(auth()).expect(200);
    check('Asistente', 'aparece en la lista del consultorio', list.body.map((a: { email: string }) => a.email), ['asistente@hce-test.local']);

    await http.post(`/api/me/assistants/${created.body.id}/password`).set(auth()).send({ password: '1111' }).expect(403);
    const adminLogin = await http.post('/api/auth/login').send({ email: 'admin@hce-test.local', password: 'AdminTest123!' }).expect(201);
    const adm = { Authorization: `Bearer ${adminLogin.body.accessToken}` };
    await http.post(`/api/me/assistants/${created.body.id}/password`).set(adm).send({ password: 'abcd' }).expect(400);
    const reset = await http.post(`/api/me/assistants/${created.body.id}/password`).set(adm).send({ password: '7350' }).expect(201);
    check('Asistente', 'el admin restablece la clave de 4 dígitos', reset.body.password, '7350');
    await http.post('/api/auth/login').send({ email: 'asistente@hce-test.local', password: '4821' }).expect(401);
    await http.post('/api/auth/login').send({ email: 'asistente@hce-test.local', password: '7350' }).expect(201);
    await http.post(`/api/me/assistants/${professionalId}/password`).set(adm).send({ password: '0000' }).expect(404);

    await http.post(`/api/me/assistants/${created.body.id}/active`).set(auth()).send({ isActive: false }).expect(201);
    await http.post('/api/auth/login').send({ email: 'asistente@hce-test.local', password: '7350' }).expect(401);
    const kept = await prisma.user.findUnique({ where: { id: created.body.id } });
    check('Asistente', 'desactivar no borra la cuenta', [kept?.isActive, !!kept], [false, true]);
  });

  it('la fecha REPS es informativa para el profesional: solo HABILISALUD la cambia', async () => {
    const sa = { Authorization: `Bearer ${saToken}` };
    await http.post('/api/me/reps-settings').set(auth()).send({ repsExpirationDate: '2030-01-15' }).expect(403);
    await http.put('/api/me/reps-settings').set(auth()).send({ repsExpirationDate: '2030-01-15' }).expect(403);
    const saved = await http.post(`/api/users/${professionalId}/reps`).set(sa).send({ repsExpirationDate: '2030-01-15' }).expect(201);
    check('REPS', 'HABILISALUD guarda la fecha', saved.body.repsExpirationDate, '2030-01-15');
    const seen = await http.get('/api/me/reps-settings').set(auth()).expect(200);
    check('REPS', 'el profesional ve la fecha', seen.body.repsExpirationDate, '2030-01-15');
    await http.post(`/api/users/${professionalId}/reps`).set(auth()).send({ repsExpirationDate: '2031-01-01' }).expect(403);
  });

  it('registro completo de psicología: guarda la ficha de ingreso sin duplicar ni borrar datos', async () => {
    await http.post('/api/patients/intake').set(auth()).send({ firstName: 'Sin', lastName: 'Documento' }).expect(400);

    const first = await http.post('/api/patients/intake').set(auth()).send({
      firstName: 'Laura Sofía',
      lastName: 'Ingreso Prueba',
      documentType: 'CC',
      documentNumber: '9000000077',
      birthDate: '1995-03-02',
      sexAtBirth: 'Femenino',
      maritalStatus: 'Soltero(a)',
      city: 'Manizales',
      department: 'Caldas',
      address: 'Cra 23 # 45-10',
      eps: 'EPS Pruebas',
      regime: 'Contributivo',
      extras: {
        birthPlace: 'Pereira',
        neighborhood: 'Chipre',
        stratum: '3',
        religion: 'Católica',
        otherSpecialtyCare: ['Psiquiatría'],
        otherSpecialtyDetail: 'Control mensual',
        currentMedications: 'Sertralina 50 mg',
      },
    }).expect(201);
    check('Ficha de ingreso', 'crea paciente nuevo', first.body.reused, false);
    let row = await prisma.patient.findUnique({ where: { id: first.body.id } });
    const extras = row?.extras as Record<string, unknown>;
    check('Ficha de ingreso', 'patients.extras.birthPlace', extras.birthPlace, 'Pereira');
    check('Ficha de ingreso', 'patients.extras.stratum', extras.stratum, '3');
    check('Ficha de ingreso', 'patients.extras.otherSpecialtyCare', extras.otherSpecialtyCare, ['Psiquiatría']);
    check('Ficha de ingreso', 'patients.regime', row?.regime, 'Contributivo');

    const again = await http.post('/api/patients/intake').set(auth()).send({
      firstName: 'Laura Sofía',
      lastName: 'Ingreso Prueba',
      documentType: 'CC',
      documentNumber: '9000000077',
      phone: '3001112233',
      eps: '',
      extras: { religion: 'Ninguna', neighborhood: '' },
    }).expect(201);
    check('Ficha de ingreso', 'reutiliza la ficha existente', [again.body.reused, again.body.id], [true, first.body.id]);
    row = await prisma.patient.findUnique({ where: { id: first.body.id } });
    const merged = row?.extras as Record<string, unknown>;
    check('Ficha de ingreso', 'completa datos nuevos', [row?.phone, merged.religion], ['3001112233', 'Ninguna']);
    check('Ficha de ingreso', 'no vacía datos previos', [row?.eps, merged.neighborhood, merged.currentMedications], ['EPS Pruebas', 'Chipre', 'Sertralina 50 mg']);
    const count = await prisma.patient.count({ where: { clinicId, documentNumber: '9000000077' } });
    check('Ficha de ingreso', 'una sola ficha por persona', count, 1);

    await http.post(`/api/patients/${first.body.id}/update`).set(auth()).send({ extras: { stratum: '4' } }).expect(201);
    row = await prisma.patient.findUnique({ where: { id: first.body.id } });
    const updated = row?.extras as Record<string, unknown>;
    check('Ficha de ingreso', 'la HC actualiza extras sin perder el resto', [updated.stratum, updated.birthPlace], ['4', 'Pereira']);
  });

  describe('enlace de la consulta virtual', () => {
    const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString();

    async function logsFor(appointmentId: string) {
      return waitFor(async () => {
        const rows = await prisma.notificationLog.findMany({ where: { appointmentId } });
        const done = rows.filter((r) => r.status !== 'PENDING');
        return done.length >= 2 ? done : null;
      }, `notificaciones de la cita ${appointmentId}`);
    }

    it('cita virtual con enlace: el correo y el WhatsApp llevan el enlace', async () => {
      const res = await http
        .post('/api/appointments')
        .set(auth())
        .send({ patientId, startsAt: inDays(3), durationMinutes: 40, modality: 'VIRTUAL', meetingUrl: MEETING_URL })
        .expect(201);
      const appt = await prisma.appointment.findUnique({ where: { id: res.body.id } });
      check('Consulta virtual', 'appointments.modality', appt?.modality, 'VIRTUAL');
      check('Consulta virtual', 'appointments.meeting_url', appt?.meetingUrl, MEETING_URL);

      const logs = await logsFor(res.body.id);
      for (const channel of ['EMAIL', 'WHATSAPP'] as const) {
        const log = logs.find((l) => l.channel === channel);
        check('Consulta virtual', `notification_logs[${channel}].status`, log?.status, 'SENT');
        check('Consulta virtual', `notification_logs[${channel}] contiene el enlace`, JSON.stringify(log?.payload ?? {}).includes(MEETING_URL), true);
        checkPresent('Consulta virtual', `notification_logs[${channel}].destination`, log?.destination);
      }
    });

    it('cita virtual sin enlace: avisa que el enlace se enviará', async () => {
      const res = await http
        .post('/api/appointments')
        .set(auth())
        .send({ patientId, startsAt: inDays(4), durationMinutes: 40, modality: 'VIRTUAL' })
        .expect(201);
      const logs = await logsFor(res.body.id);
      const email = logs.find((l) => l.channel === 'EMAIL');
      check('Consulta virtual', 'sin enlace: mensaje "Le enviaremos el enlace"', JSON.stringify(email?.payload ?? {}).includes('Le enviaremos el enlace'), true);
    });

    it('cita presencial: no envía enlace y descarta meetingUrl', async () => {
      const res = await http
        .post('/api/appointments')
        .set(auth())
        .send({ patientId, startsAt: inDays(5), durationMinutes: 40, modality: 'IN_PERSON', meetingUrl: MEETING_URL })
        .expect(201);
      const appt = await prisma.appointment.findUnique({ where: { id: res.body.id } });
      check('Consulta presencial', 'appointments.meeting_url (descartado)', appt?.meetingUrl, null);
      const logs = await logsFor(res.body.id);
      check('Consulta presencial', 'mensajes sin enlace', logs.every((l) => !JSON.stringify(l.payload ?? {}).includes(MEETING_URL)), true);
    });
  });
});

function printReport() {
  if (!report.length) return;
  const ok = report.filter((r) => r.ok).length;
  const lines = [
    '# Informe de almacenamiento de la historia clínica',
    '',
    `Fecha: ${new Date().toISOString()} · Base de pruebas desechable · ${ok}/${report.length} campos correctos`,
    '',
    '| Resultado | Sección | Campo | Esperado | Guardado en la base |',
    '|---|---|---|---|---|',
    ...report.map((r) =>
      `| ${r.ok ? 'OK' : 'FALLA'} | ${r.section} | ${r.field} | ${r.expected.replace(/\|/g, '\\|')} | ${r.stored.replace(/\|/g, '\\|')} |`,
    ),
  ];
  const out = path.join(__dirname, 'reports', 'hce-storage-report.md');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, lines.join('\n') + '\n');
  // eslint-disable-next-line no-console
  console.log(`\n${lines.join('\n')}\n\nInforme guardado en ${out}`);
}
