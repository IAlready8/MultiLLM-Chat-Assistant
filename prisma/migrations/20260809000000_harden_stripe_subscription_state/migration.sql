ALTER TABLE "Subscription"
ADD COLUMN "stripeStatus" TEXT,
ADD COLUMN "stripeCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
