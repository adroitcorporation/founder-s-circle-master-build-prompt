import { Prisma } from "@prisma/client";
export const profileInclude = {
  college: true,
  interests: { include: { interest: true } },
  skills: { include: { skill: true } },
  user: { select: { verified: true } },
} satisfies Prisma.ProfileInclude;
export type FullProfile = Prisma.ProfileGetPayload<{
  include: typeof profileInclude;
}>;
export function publicProfile(p: FullProfile) {
  return {
    id: p.userId,
    name: p.name,
    username: p.username,
    collegeId: p.collegeId,
    college: p.college?.name ?? "",
    degree: p.degree,
    year: p.year,
    bio: p.bio,
    about: p.about,
    photo: p.photoKey ? `/api/uploads/photo/${p.userId}` : null,
    verified: p.user.verified,
    city: p.showCity ? p.city : "",
    socialLinks: p.showSocialLinks ? p.socialLinks : [],
    goals: p.goals,
    hobbies: p.hobbies,
    careerInterests: p.careerInterests,
    startupInterests: p.startupInterests,
    interests: p.interests.map((x) => x.interest),
    skills: p.skills.map((x) => x.skill),
  };
}
