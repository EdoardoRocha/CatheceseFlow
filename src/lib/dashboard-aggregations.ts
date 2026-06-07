import type { Lecture, Student } from "@/lib/api";

export type StudentRef = Student & { className?: string };

export type AttendanceRow = Record<string, unknown>;

export function normalizeStudent(raw: Record<string, unknown>): Student {
  const birthRaw = raw.birth_date ?? raw.birthDate;
  return {
    id: Number(raw.id),
    name: String(raw.name ?? ""),
    phone: String(raw.phone ?? ""),
    cpf: String(raw.cpf ?? ""),
    birthDate:
      birthRaw == null || birthRaw === ""
        ? null
        : String(birthRaw).split("T")[0],
    fatherName: String(raw.father_name ?? raw.fatherName ?? ""),
    motherName: String(raw.mother_name ?? raw.motherName ?? ""),
    ClassId: Number(raw.ClassId ?? raw.classId),
    AddressId: Number(raw.AddressId ?? raw.addressId),
    hasBaptism: !!(raw.hasBaptism ?? raw.has_baptism),
    hasFirstCommunion: !!(raw.hasFirstCommunion ?? raw.has_first_communion),
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