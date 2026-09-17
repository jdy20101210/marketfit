import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getEnv } from "@/lib/env";
import { getLocalDataDir } from "@/lib/runtime";

/**
 * 서버 비밀키 결정 순서
 * 1) APP_SECRET 환경변수 (권장)
 * 2) ADMIN_PASSWORD에서 파생 (배포 환경에서 APP_SECRET을 빠뜨린 경우)
 * 3) 로컬 데이터 폴더의 자동 생성 키 (개발/자체 서버)
 * 4) 프로세스 임시 키 (서버리스 + 설정 없음: 재시작 시 세션이 초기화됨)
 */
type SecretSource = "env" | "admin-password" | "local-file" | "ephemeral";

let secretCache: { key: Buffer; source: SecretSource } | null = null;

export function getAppSecret(): { key: Buffer; source: SecretSource } {
  if (secretCache) return secretCache;
  const env = getEnv();
  if (env.APP_SECRET) {
    secretCache = { key: createHash("sha256").update(env.APP_SECRET).digest(), source: "env" };
    return secretCache;
  }
  if (env.ADMIN_PASSWORD) {
    const derived = Buffer.from(hkdfSync("sha256", env.ADMIN_PASSWORD, "marketfit/app-secret/v1", "derive", 32));
    secretCache = { key: derived, source: "admin-password" };
    return secretCache;
  }
  const dir = getLocalDataDir();
  if (dir) {
    const file = path.join(dir, "app-secret.key");
    try {
      if (!existsSync(file)) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file, randomBytes(32).toString("base64"), { mode: 0o600 });
      }
      secretCache = { key: Buffer.from(readFileSync(file, "utf8").trim(), "base64"), source: "local-file" };
      return secretCache;
    } catch (err) {
      console.warn("[crypto] 로컬 비밀키 파일을 사용할 수 없습니다:", err);
    }
  }
  console.warn("[crypto] APP_SECRET이 없어 임시 키를 사용합니다. 배포 환경에서는 APP_SECRET을 설정하세요.");
  secretCache = { key: randomBytes(32), source: "ephemeral" };
  return secretCache;
}

function subKey(purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", getAppSecret().key, `marketfit/${purpose}`, "subkey", 32));
}

const b64u = {
  encode: (buf: Buffer) => buf.toString("base64url"),
  decode: (s: string) => Buffer.from(s, "base64url"),
};

/** AES-256-GCM 암호화. 형식: v1.<iv>.<tag>.<ciphertext> */
export function encryptString(plaintext: string, purpose = "data"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", subKey(`enc/${purpose}`), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", b64u.encode(iv), b64u.encode(tag), b64u.encode(enc)].join(".");
}

export function decryptString(token: string, purpose = "data"): string | null {
  try {
    const [version, ivS, tagS, dataS] = token.split(".");
    if (version !== "v1" || !ivS || !tagS || dataS === undefined) return null;
    const decipher = createDecipheriv("aes-256-gcm", subKey(`enc/${purpose}`), b64u.decode(ivS));
    decipher.setAuthTag(b64u.decode(tagS));
    return Buffer.concat([decipher.update(b64u.decode(dataS)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function encryptJson(value: unknown, purpose: string): string {
  return encryptString(JSON.stringify(value), purpose);
}

export function decryptJson<T>(token: string | undefined | null, purpose: string): T | null {
  if (!token) return null;
  const text = decryptString(token, purpose);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** HMAC 서명 값. 형식: <payload-b64u>.<sig-b64u> */
export function signPayload(payload: object, purpose: string): string {
  const body = b64u.encode(Buffer.from(JSON.stringify(payload)));
  const sig = createHmac("sha256", subKey(`sig/${purpose}`)).update(body).digest();
  return `${body}.${b64u.encode(sig)}`;
}

export function verifyPayload<T>(token: string | undefined | null, purpose: string): T | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", subKey(`sig/${purpose}`)).update(body).digest();
  const given = b64u.decode(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(b64u.decode(body).toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** 길이가 달라도 타이밍 차이가 없도록 해시 후 비교합니다. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
