/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_backfillShadowDeltas from "../actions/backfillShadowDeltas.js";
import type * as actions_chatAI from "../actions/chatAI.js";
import type * as actions_dealTermExtraction from "../actions/dealTermExtraction.js";
import type * as actions_esign from "../actions/esign.js";
import type * as actions_kyc from "../actions/kyc.js";
import type * as actions_migrateIncentiveV3 from "../actions/migrateIncentiveV3.js";
import type * as actions_notifications from "../actions/notifications.js";
import type * as actions_transcription from "../actions/transcription.js";
import type * as actions_workos from "../actions/workos.js";
import type * as admins from "../admins.js";
import type * as analytics from "../analytics.js";
import type * as attribution from "../attribution.js";
import type * as auditLogs from "../auditLogs.js";
import type * as auth from "../auth.js";
import type * as briefing from "../briefing.js";
import type * as buildings from "../buildings.js";
import type * as chatAIMonitor from "../chatAIMonitor.js";
import type * as chatBatching from "../chatBatching.js";
import type * as chatChannels from "../chatChannels.js";
import type * as chatMessages from "../chatMessages.js";
import type * as chatReadReceipts from "../chatReadReceipts.js";
import type * as checklistTemplates from "../checklistTemplates.js";
import type * as checklists from "../checklists.js";
import type * as closures from "../closures.js";
import type * as commissionEngine from "../commissionEngine.js";
import type * as commissionModifierTemplates from "../commissionModifierTemplates.js";
import type * as crons from "../crons.js";
import type * as dealChecklistApprovals from "../dealChecklistApprovals.js";
import type * as dealChecklists from "../dealChecklists.js";
import type * as dealContributions from "../dealContributions.js";
import type * as depositRecords from "../depositRecords.js";
import type * as documents from "../documents.js";
import type * as fieldWorkerContracts from "../fieldWorkerContracts.js";
import type * as fieldWorkerRollout from "../fieldWorkerRollout.js";
import type * as functions from "../functions.js";
import type * as gamification from "../gamification.js";
import type * as guardShifts from "../guardShifts.js";
import type * as guards from "../guards.js";
import type * as http from "../http.js";
import type * as incentiveActors from "../incentiveActors.js";
import type * as incentiveConfig from "../incentiveConfig.js";
import type * as incentiveDisbursements from "../incentiveDisbursements.js";
import type * as incentives from "../incentives.js";
import type * as kycPackets from "../kycPackets.js";
import type * as leads from "../leads.js";
import type * as listings from "../listings.js";
import type * as migrateIncentiveV3 from "../migrateIncentiveV3.js";
import type * as migrations from "../migrations.js";
import type * as monetization from "../monetization.js";
import type * as negotiationChecklist from "../negotiationChecklist.js";
import type * as negotiationProposals from "../negotiationProposals.js";
import type * as negotiationTokens from "../negotiationTokens.js";
import type * as negotiations from "../negotiations.js";
import type * as newsletterSubscriptions from "../newsletterSubscriptions.js";
import type * as notifications from "../notifications.js";
import type * as opsManagement from "../opsManagement.js";
import type * as ownerInvites from "../ownerInvites.js";
import type * as ownerServiceRequests from "../ownerServiceRequests.js";
import type * as owners from "../owners.js";
import type * as payouts from "../payouts.js";
import type * as rateLimiter from "../rateLimiter.js";
import type * as referralCodes from "../referralCodes.js";
import type * as referralConfig from "../referralConfig.js";
import type * as referralMilestones from "../referralMilestones.js";
import type * as referrals from "../referrals.js";
import type * as rentalAgreements from "../rentalAgreements.js";
import type * as rentalTransactions from "../rentalTransactions.js";
import type * as revenueLineItems from "../revenueLineItems.js";
import type * as rmAssignments from "../rmAssignments.js";
import type * as roles from "../roles.js";
import type * as seed from "../seed.js";
import type * as seedDemo from "../seedDemo.js";
import type * as seedDemoChat from "../seedDemoChat.js";
import type * as seedDemoCommandCenter from "../seedDemoCommandCenter.js";
import type * as seedDemoEdgeCases from "../seedDemoEdgeCases.js";
import type * as seedDemoJourneys from "../seedDemoJourneys.js";
import type * as seedDemoNegotiations from "../seedDemoNegotiations.js";
import type * as seedDemoTier2 from "../seedDemoTier2.js";
import type * as seedDemoTransactions from "../seedDemoTransactions.js";
import type * as seedHelpers from "../seedHelpers.js";
import type * as shadowMode from "../shadowMode.js";
import type * as shadowRollout from "../shadowRollout.js";
import type * as sla from "../sla.js";
import type * as societies from "../societies.js";
import type * as societyLiaison from "../societyLiaison.js";
import type * as storageValidation from "../storageValidation.js";
import type * as supportInquiries from "../supportInquiries.js";
import type * as systemConfig from "../systemConfig.js";
import type * as tenantDashboard from "../tenantDashboard.js";
import type * as tenantFavorites from "../tenantFavorites.js";
import type * as tenantInbox from "../tenantInbox.js";
import type * as tenantInquiries from "../tenantInquiries.js";
import type * as tenantProfile from "../tenantProfile.js";
import type * as testUtils_fieldWorkerAsserts from "../testUtils/fieldWorkerAsserts.js";
import type * as testUtils_fieldWorkerFixtures from "../testUtils/fieldWorkerFixtures.js";
import type * as tokenBookings from "../tokenBookings.js";
import type * as transactionFees from "../transactionFees.js";
import type * as trustBadges from "../trustBadges.js";
import type * as userRoleAssignments from "../userRoleAssignments.js";
import type * as users from "../users.js";
import type * as verifications from "../verifications.js";
import type * as visits from "../visits.js";
import type * as voiceTranscriptions from "../voiceTranscriptions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/backfillShadowDeltas": typeof actions_backfillShadowDeltas;
  "actions/chatAI": typeof actions_chatAI;
  "actions/dealTermExtraction": typeof actions_dealTermExtraction;
  "actions/esign": typeof actions_esign;
  "actions/kyc": typeof actions_kyc;
  "actions/migrateIncentiveV3": typeof actions_migrateIncentiveV3;
  "actions/notifications": typeof actions_notifications;
  "actions/transcription": typeof actions_transcription;
  "actions/workos": typeof actions_workos;
  admins: typeof admins;
  analytics: typeof analytics;
  attribution: typeof attribution;
  auditLogs: typeof auditLogs;
  auth: typeof auth;
  briefing: typeof briefing;
  buildings: typeof buildings;
  chatAIMonitor: typeof chatAIMonitor;
  chatBatching: typeof chatBatching;
  chatChannels: typeof chatChannels;
  chatMessages: typeof chatMessages;
  chatReadReceipts: typeof chatReadReceipts;
  checklistTemplates: typeof checklistTemplates;
  checklists: typeof checklists;
  closures: typeof closures;
  commissionEngine: typeof commissionEngine;
  commissionModifierTemplates: typeof commissionModifierTemplates;
  crons: typeof crons;
  dealChecklistApprovals: typeof dealChecklistApprovals;
  dealChecklists: typeof dealChecklists;
  dealContributions: typeof dealContributions;
  depositRecords: typeof depositRecords;
  documents: typeof documents;
  fieldWorkerContracts: typeof fieldWorkerContracts;
  fieldWorkerRollout: typeof fieldWorkerRollout;
  functions: typeof functions;
  gamification: typeof gamification;
  guardShifts: typeof guardShifts;
  guards: typeof guards;
  http: typeof http;
  incentiveActors: typeof incentiveActors;
  incentiveConfig: typeof incentiveConfig;
  incentiveDisbursements: typeof incentiveDisbursements;
  incentives: typeof incentives;
  kycPackets: typeof kycPackets;
  leads: typeof leads;
  listings: typeof listings;
  migrateIncentiveV3: typeof migrateIncentiveV3;
  migrations: typeof migrations;
  monetization: typeof monetization;
  negotiationChecklist: typeof negotiationChecklist;
  negotiationProposals: typeof negotiationProposals;
  negotiationTokens: typeof negotiationTokens;
  negotiations: typeof negotiations;
  newsletterSubscriptions: typeof newsletterSubscriptions;
  notifications: typeof notifications;
  opsManagement: typeof opsManagement;
  ownerInvites: typeof ownerInvites;
  ownerServiceRequests: typeof ownerServiceRequests;
  owners: typeof owners;
  payouts: typeof payouts;
  rateLimiter: typeof rateLimiter;
  referralCodes: typeof referralCodes;
  referralConfig: typeof referralConfig;
  referralMilestones: typeof referralMilestones;
  referrals: typeof referrals;
  rentalAgreements: typeof rentalAgreements;
  rentalTransactions: typeof rentalTransactions;
  revenueLineItems: typeof revenueLineItems;
  rmAssignments: typeof rmAssignments;
  roles: typeof roles;
  seed: typeof seed;
  seedDemo: typeof seedDemo;
  seedDemoChat: typeof seedDemoChat;
  seedDemoCommandCenter: typeof seedDemoCommandCenter;
  seedDemoEdgeCases: typeof seedDemoEdgeCases;
  seedDemoJourneys: typeof seedDemoJourneys;
  seedDemoNegotiations: typeof seedDemoNegotiations;
  seedDemoTier2: typeof seedDemoTier2;
  seedDemoTransactions: typeof seedDemoTransactions;
  seedHelpers: typeof seedHelpers;
  shadowMode: typeof shadowMode;
  shadowRollout: typeof shadowRollout;
  sla: typeof sla;
  societies: typeof societies;
  societyLiaison: typeof societyLiaison;
  storageValidation: typeof storageValidation;
  supportInquiries: typeof supportInquiries;
  systemConfig: typeof systemConfig;
  tenantDashboard: typeof tenantDashboard;
  tenantFavorites: typeof tenantFavorites;
  tenantInbox: typeof tenantInbox;
  tenantInquiries: typeof tenantInquiries;
  tenantProfile: typeof tenantProfile;
  "testUtils/fieldWorkerAsserts": typeof testUtils_fieldWorkerAsserts;
  "testUtils/fieldWorkerFixtures": typeof testUtils_fieldWorkerFixtures;
  tokenBookings: typeof tokenBookings;
  transactionFees: typeof transactionFees;
  trustBadges: typeof trustBadges;
  userRoleAssignments: typeof userRoleAssignments;
  users: typeof users;
  verifications: typeof verifications;
  visits: typeof visits;
  voiceTranscriptions: typeof voiceTranscriptions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workOSAuthKit: {
    lib: {
      enqueueWebhookEvent: FunctionReference<
        "mutation",
        "internal",
        {
          apiKey: string;
          event: string;
          eventId: string;
          eventTypes?: Array<string>;
          logLevel?: "DEBUG";
          onEventHandle?: string;
          updatedAt?: string;
        },
        any
      >;
      getAuthUser: FunctionReference<
        "query",
        "internal",
        { id: string },
        {
          createdAt: string;
          email: string;
          emailVerified: boolean;
          externalId?: null | string;
          firstName?: null | string;
          id: string;
          lastName?: null | string;
          lastSignInAt?: null | string;
          locale?: null | string;
          metadata: Record<string, any>;
          profilePictureUrl?: null | string;
          updatedAt: string;
        } | null
      >;
    };
  };
  rateLimiter: {
    lib: {
      checkRateLimit: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      clearAll: FunctionReference<
        "mutation",
        "internal",
        { before?: number },
        null
      >;
      getServerTime: FunctionReference<"mutation", "internal", {}, number>;
      getValue: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          key?: string;
          name: string;
          sampleShards?: number;
        },
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          shard: number;
          ts: number;
          value: number;
        }
      >;
      rateLimit: FunctionReference<
        "mutation",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      resetRateLimit: FunctionReference<
        "mutation",
        "internal",
        { key?: string; name: string },
        null
      >;
    };
    time: {
      getServerTime: FunctionReference<"mutation", "internal", {}, number>;
    };
  };
  leadCounts: {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any },
        { count: number; sum: number }
      >;
      aggregateBetweenBatch: FunctionReference<
        "query",
        "internal",
        { queries: Array<{ k1?: any; k2?: any; namespace?: any }> },
        Array<{ count: number; sum: number }>
      >;
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetBatch: FunctionReference<
        "query",
        "internal",
        {
          queries: Array<{
            k1?: any;
            k2?: any;
            namespace?: any;
            offset: number;
          }>;
        },
        Array<{ k: any; s: number; v: any }>
      >;
      get: FunctionReference<
        "query",
        "internal",
        { key: any; namespace?: any },
        null | { k: any; s: number; v: any }
      >;
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any; namespace?: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any; namespace?: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string;
          k1?: any;
          k2?: any;
          limit: number;
          namespace?: any;
          order: "asc" | "desc";
        },
        {
          cursor: string;
          isDone: boolean;
          page: Array<{ k: any; s: number; v: any }>;
        }
      >;
      paginateNamespaces: FunctionReference<
        "query",
        "internal",
        { cursor?: string; limit: number },
        { cursor: string; isDone: boolean; page: Array<any> }
      >;
      validate: FunctionReference<
        "query",
        "internal",
        { namespace?: any },
        any
      >;
    };
    inspect: {
      display: FunctionReference<"query", "internal", { namespace?: any }, any>;
      dump: FunctionReference<"query", "internal", { namespace?: any }, string>;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { namespace?: any; node?: string },
        null
      >;
      listTreeNodes: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          aggregate?: { count: number; sum: number };
          items: Array<{ k: any; s: number; v: any }>;
          subtrees: Array<string>;
        }>
      >;
      listTrees: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          maxNodeSize: number;
          namespace?: any;
          root: string;
        }>
      >;
    };
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      delete_: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        any
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<
        "mutation",
        "internal",
        { namespace?: any },
        null
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        any
      >;
    };
  };
  visitCounts: {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any },
        { count: number; sum: number }
      >;
      aggregateBetweenBatch: FunctionReference<
        "query",
        "internal",
        { queries: Array<{ k1?: any; k2?: any; namespace?: any }> },
        Array<{ count: number; sum: number }>
      >;
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetBatch: FunctionReference<
        "query",
        "internal",
        {
          queries: Array<{
            k1?: any;
            k2?: any;
            namespace?: any;
            offset: number;
          }>;
        },
        Array<{ k: any; s: number; v: any }>
      >;
      get: FunctionReference<
        "query",
        "internal",
        { key: any; namespace?: any },
        null | { k: any; s: number; v: any }
      >;
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any; namespace?: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any; namespace?: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string;
          k1?: any;
          k2?: any;
          limit: number;
          namespace?: any;
          order: "asc" | "desc";
        },
        {
          cursor: string;
          isDone: boolean;
          page: Array<{ k: any; s: number; v: any }>;
        }
      >;
      paginateNamespaces: FunctionReference<
        "query",
        "internal",
        { cursor?: string; limit: number },
        { cursor: string; isDone: boolean; page: Array<any> }
      >;
      validate: FunctionReference<
        "query",
        "internal",
        { namespace?: any },
        any
      >;
    };
    inspect: {
      display: FunctionReference<"query", "internal", { namespace?: any }, any>;
      dump: FunctionReference<"query", "internal", { namespace?: any }, string>;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { namespace?: any; node?: string },
        null
      >;
      listTreeNodes: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          aggregate?: { count: number; sum: number };
          items: Array<{ k: any; s: number; v: any }>;
          subtrees: Array<string>;
        }>
      >;
      listTrees: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          maxNodeSize: number;
          namespace?: any;
          root: string;
        }>
      >;
    };
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      delete_: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        any
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<
        "mutation",
        "internal",
        { namespace?: any },
        null
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        any
      >;
    };
  };
  payoutTotals: {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any },
        { count: number; sum: number }
      >;
      aggregateBetweenBatch: FunctionReference<
        "query",
        "internal",
        { queries: Array<{ k1?: any; k2?: any; namespace?: any }> },
        Array<{ count: number; sum: number }>
      >;
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetBatch: FunctionReference<
        "query",
        "internal",
        {
          queries: Array<{
            k1?: any;
            k2?: any;
            namespace?: any;
            offset: number;
          }>;
        },
        Array<{ k: any; s: number; v: any }>
      >;
      get: FunctionReference<
        "query",
        "internal",
        { key: any; namespace?: any },
        null | { k: any; s: number; v: any }
      >;
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any; namespace?: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any; namespace?: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string;
          k1?: any;
          k2?: any;
          limit: number;
          namespace?: any;
          order: "asc" | "desc";
        },
        {
          cursor: string;
          isDone: boolean;
          page: Array<{ k: any; s: number; v: any }>;
        }
      >;
      paginateNamespaces: FunctionReference<
        "query",
        "internal",
        { cursor?: string; limit: number },
        { cursor: string; isDone: boolean; page: Array<any> }
      >;
      validate: FunctionReference<
        "query",
        "internal",
        { namespace?: any },
        any
      >;
    };
    inspect: {
      display: FunctionReference<"query", "internal", { namespace?: any }, any>;
      dump: FunctionReference<"query", "internal", { namespace?: any }, string>;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { namespace?: any; node?: string },
        null
      >;
      listTreeNodes: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          aggregate?: { count: number; sum: number };
          items: Array<{ k: any; s: number; v: any }>;
          subtrees: Array<string>;
        }>
      >;
      listTrees: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          maxNodeSize: number;
          namespace?: any;
          root: string;
        }>
      >;
    };
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      delete_: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        any
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<
        "mutation",
        "internal",
        { namespace?: any },
        null
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        any
      >;
    };
  };
};
