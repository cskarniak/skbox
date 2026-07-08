-- CreateTable
CREATE TABLE "CameraImagingProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cameraId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brightness" INTEGER,
    "contrast" INTEGER,
    "saturation" INTEGER,
    "sharpness" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CameraImagingProfile_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CameraImagingProfile_cameraId_idx" ON "CameraImagingProfile"("cameraId");
