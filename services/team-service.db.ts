import { prisma } from '@/lib/prisma'
import { Team } from '@prisma/client'

// Define the type for team role as string
type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER';

/**
 * Service for all database operations related to Teams/Organizations.
 */
export const TeamService = {
  /**
   * Creates a new team and assigns the user as its OWNER.
   */
  async createTeam(name: string, userId: string): Promise<Team> {
    return prisma.team.create({
      data: {
        name: name,
        members: {
          create: {
            userId: userId,
            role: 'OWNER',
          },
        },
      },
    })
  },

  /**
   * Gets all teams a user is a member of.
   */
  async getTeamsByUserId(userId: string) {
    return prisma.team.findMany({
      where: {
        members: {
          some: {
            userId: userId,
          },
        },
      },
      include: {
        _count: {
          select: { members: true },
        },
      },
    })
  },

  /**
   * Gets a specific team's details, including its members.
   * Ensures the user is a member of that team.
   */
  async getTeamDetails(teamId: string, userId: string) {
    return prisma.team.findFirst({
      where: {
        id: teamId,
        members: {
          some: {
            userId: userId,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
      },
    })
  },

  // ... other methods like 'inviteUser', 'removeUser', 'updateRole' ...
}