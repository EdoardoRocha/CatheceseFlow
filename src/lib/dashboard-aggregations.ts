import type { Lecture, Student, StudentAddress, StudentPhone } from "@/lib/api";

export type StudentRef = Student & { className?: string };

export type AttendanceRow = Record<string, unknown>;

function normalizePhones(raw: Record<string, unknown>): StudentPhone[] {
  const rawPhones = raw.phones;
  if (Array.isArray(rawPhones) && rawPhones.length > 0) {
    return rawPhones
      .map((entry) => {
        const item = entry as Record<string, unknown>;
        const number = String(item.number ?? item.phone ?? "").trim();
        if (!number) return null;
        const labelRaw = item.label;
        const label =
          labelRaw == null || String(labelRaw).trim() === ""
            ? null
            : String(labelRaw).trim();
        return {
          id: item.id != null ? Number(item.id) : undefined,
          number,
          label,
        };
      })
      .filter((entry): entry is StudentPhone => entry != null);
  }

  const legacyPhone = String(raw.phone ?? "").trim();
  if (legacyPhone) {
    return [{ number: legacyPhone, label: null }];
  }

  return [];
}

function normalizeAddress(raw: Record<string, unknown>): StudentAddress {
  const nested = raw.Address ?? raw.address;
  const source =
    nested && typeof nested === "object"
      ? (nested as Record<string, unknown>)
      : raw;

  const houseRaw = source.house_number ?? source.houseNumber;
  return {
    road: trimOptionalString(source.road),
    house_number:
      houseRaw == null || String(houseRaw).trim() === ""
        ? null
        : Number(houseRaw),
    code: trimOptionalString(source.code),
    city: trimOptionalString(source.city),
    neighborhood: trimOptionalString(source.neighborhood),
  };
}

function trimOptionalString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function matchesStudentName(student: Student, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return normalizeSearchText(student.name).includes(normalizedQuery);
}

export function normalizeStudent(raw: Record<string, unknown>): Student {
  const birthRaw = raw.birth_date ?? raw.birthDate;
  const phones = normalizePhones(raw);
  const address = normalizeAddress(raw);
  return {
    id: Number(raw.id),
    name: String(raw.name ?? ""),
    phones,
    phone: phones[0]?.number,
    cpf: String(raw.cpf ?? ""),
    birthDate:
      birthRaw == null || birthRaw === ""
        ? null
        : String(birthRaw).split("T")[0],
    fatherName: String(raw.father_name ?? raw.fatherName ?? ""),
    motherName: String(raw.mother_name ?? raw.motherName ?? ""),
    description: String(raw.description ?? ""),
    ClassId: Number(raw.ClassId ?? raw.classId),
    AddressId: Number(raw.AddressId ?? raw.addressId ?? 0),
    hasBaptism: !!(raw.hasBaptism ?? raw.has_baptism),
    hasFirstCommunion: !!(raw.hasFirstCommunion ?? raw.has_first_communion),
    address,
    road: address.road,
    house_number: address.house_number,
    code: address.code,
    city: address.city,
    neighborhood: address.neighborhood,
  };
}

export function normalizeStudents(rows: unknown[]): Student[] {
  return rows.map((r) => normalizeStudent(r as Record<string, unknown>));
}

export function pickStudentId(r: AttendanceRow): number | null {
  const v = r.studentId ?? r.StudentId ?? r.student_id;
  return typeof v === "number" ? v : null;
}

export function lectureDate(l: Lecture): Date | null {
  if (!l?.date) return null;
  const iso = l.date.includes("T") ? l.date : `${l.date}T00:00:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export function inMonth(d: Date, year: number, month: number) {
  return d.getFullYear() === year && d.getMonth() === month;
}

export type StudentTally = {
  studentId: number;
  name: string;
  className: string;
  present: number;
  absent: number;
  total: number;
  rate: number;
};

export function buildRanking(
  students: StudentRef[],
  presentByStudent: Map<number, number>,
  absentByStudent: Map<number, number>,
): StudentTally[] {
  return students.map((s) => {
    const present = presentByStudent.get(s.id) ?? 0;
    const absent = absentByStudent.get(s.id) ?? 0;
    const total = present + absent;
    return {
      studentId: s.id,
      name: s.name,
      className: s.className ?? "—",
      present,
      absent,
      total,
      rate: total === 0 ? 0 : present / total,
    };
  });
}

export function topPresent(rows: StudentTally[], n = 5) {
  return [...rows]
    .filter((r) => r.present > 0)
    .sort((a, b) => b.present - a.present || b.rate - a.rate)
    .slice(0, n);
}

export function topAbsent(rows: StudentTally[], n = 5) {
  return [...rows]
    .filter((r) => r.absent > 0)
    .sort((a, b) => b.absent - a.absent || a.rate - b.rate)
    .slice(0, n);
}