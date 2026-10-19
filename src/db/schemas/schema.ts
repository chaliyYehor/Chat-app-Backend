import { relations, sql } from 'drizzle-orm'
import {
	pgTable,
	text,
	timestamp,
	boolean,
	index,
	pgEnum,
	date,
	integer,
} from 'drizzle-orm/pg-core'

import { check, primaryKey, unique } from 'drizzle-orm/pg-core'

// auth

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').default(false).notNull(),
	image: text('image'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
})

export const session = pgTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: timestamp('expires_at').notNull(),
		token: text('token').notNull().unique(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
	},
	table => [index('session_userId_idx').on(table.userId)],
)

export const account = pgTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at'),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
		scope: text('scope'),
		password: text('password'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	table => [index('account_userId_idx').on(table.userId)],
)

export const verification = pgTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: timestamp('expires_at').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	table => [index('verification_identifier_idx').on(table.identifier)],
)

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
}))

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}))

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}))

// application

export const previouslySetStatusEnum = pgEnum('previously_set_status', [
	'online',
	'away',
	'offline',
])
export const statusEnum = pgEnum('status', ['online', 'offline'])
export const themeEnum = pgEnum('theme', ['light', 'dark'])

export const userProfile = pgTable('user_profile', {
	userId: text('user_id')
		.references(() => user.id, { onDelete: 'cascade' })
		.notNull(),
	imageUrl: text('image_url'),
	imagePubId: text('image_pub_id'),
	about: text('about'),
	name: text('name').notNull(),
	theme: themeEnum('theme').default('dark').notNull(),
	userPubId: text('user_pub_id').notNull().unique(),
	previouslySetStatus: previouslySetStatusEnum('previously_set_status')
		.default('online')
		.notNull(),
	status: statusEnum('status').default('offline').notNull(),
	lastSeen: timestamp('last_seen', { withTimezone: true })
		.defaultNow()
		.notNull(),
	createdAt: timestamp('created_at', {
		withTimezone: true,
	})
		.defaultNow()
		.notNull(),

	updatedAt: timestamp('updated_at', {
		withTimezone: true,
	})
		.defaultNow()
		.notNull(),
})

export const conversationStatus = pgEnum('conversation_status', [
	'pinned',
	'unpinned',
])

export const conversation = pgTable(
	'conversation',
	{
		id: text('id').primaryKey(),

		userOneId: text('user_one_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),

		userTwoId: text('user_two_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),

		lastMessageId: text('last_message_id'),
		lastMessageAt: timestamp('last_message_at', {
			withTimezone: true,
		}),

		createdAt: timestamp('created_at', {
			withTimezone: true,
		})
			.defaultNow()
			.notNull(),

		updatedAt: timestamp('updated_at', {
			withTimezone: true,
		})
			.defaultNow()
			.notNull(),
	},
	table => [
		unique('conversation_users_unique').on(table.userOneId, table.userTwoId),

		check(
			'conversation_users_different',
			sql`${table.userOneId} <> ${table.userTwoId}`,
		),

		index('conversation_user_one_idx').on(table.userOneId),
		index('conversation_user_two_idx').on(table.userTwoId),
	],
)

export const conversationUser = pgTable(
	'conversation_user',
	{
		conversationId: text('conversation_id')
			.notNull()
			.references(() => conversation.id, { onDelete: 'cascade' }),

		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),

		isPinned: boolean('is_pinned').default(false).notNull(),

		lastReadMessageId: text('last_read_message_id'),

		unreadMessagesCount: integer('unread_messages_count').default(0).notNull(),

		createdAt: timestamp('created_at', {
			withTimezone: true,
		})
			.defaultNow()
			.notNull(),
	},
	table => [
		primaryKey({
			columns: [table.conversationId, table.userId],
		}),

		index('conversation_user_user_id_idx').on(table.userId),
	],
)

export const userPreferences = pgTable('user_preferences', {
	userId: text('user_id')
		.references(() => user.id, { onDelete: 'cascade' })
		.notNull(),
	typingSounds: boolean('typing_sounds').default(true),
	messageSounds: boolean('message_sounds').default(true),
	readReceipts: boolean('read_receipts').default(true),
	lastSeen: boolean('last_seen').default(true),
})
