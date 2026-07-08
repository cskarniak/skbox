PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Camera" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "room" TEXT,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 554,
    "path" TEXT NOT NULL DEFAULT '',
    "username" TEXT,
    "password" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Camera" ("id","name","room","host","port","path","username","password","active","order","createdAt","updatedAt")
WITH parsed AS (
  SELECT
    "id","name","room","active","order","createdAt","updatedAt",
    substr("rtspUrl", 8) AS after_scheme
  FROM "Camera"
),
split_auth AS (
  SELECT *,
    CASE WHEN instr(after_scheme, '@') > 0 THEN substr(after_scheme, 1, instr(after_scheme, '@') - 1) END AS userinfo,
    CASE WHEN instr(after_scheme, '@') > 0 THEN substr(after_scheme, instr(after_scheme, '@') + 1) ELSE after_scheme END AS rest
  FROM parsed
),
split_path AS (
  SELECT *,
    CASE WHEN instr(rest, '/') > 0 THEN substr(rest, 1, instr(rest, '/') - 1) ELSE rest END AS hostport,
    CASE WHEN instr(rest, '/') > 0 THEN substr(rest, instr(rest, '/')) ELSE '' END AS url_path
  FROM split_auth
)
SELECT
  "id","name","room",
  CASE WHEN instr(hostport, ':') > 0 THEN substr(hostport, 1, instr(hostport, ':') - 1) ELSE hostport END AS host,
  CASE WHEN instr(hostport, ':') > 0 THEN CAST(substr(hostport, instr(hostport, ':') + 1) AS INTEGER) ELSE 554 END AS port,
  url_path AS path,
  CASE WHEN userinfo IS NOT NULL AND instr(userinfo, ':') > 0 THEN substr(userinfo, 1, instr(userinfo, ':') - 1)
       ELSE userinfo END AS username,
  CASE WHEN userinfo IS NOT NULL AND instr(userinfo, ':') > 0 THEN substr(userinfo, instr(userinfo, ':') + 1)
       ELSE NULL END AS password,
  "active","order","createdAt","updatedAt"
FROM split_path;

DROP TABLE "Camera";
ALTER TABLE "new_Camera" RENAME TO "Camera";

PRAGMA foreign_keys=ON;
