// nextauth.ts
callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.token = user.token; // dari hasil login
      }
      return token;
    },
    async session({ session, token }) {
      session.user.token = token.token as string;
      return session;
    },
  },
  