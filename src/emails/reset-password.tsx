import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface ResetPasswordEmailProps {
  username: string;
  resetUrl: string;
}

export default function ResetPasswordEmail({
  username,
  resetUrl,
}: ResetPasswordEmailProps) {
  return (
    <Html>
      <Head />

      <Preview>Reset your password</Preview>

      <Body
        style={{
          backgroundColor: "#f4f4f5",
          fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        }}
      >
        <Container
          style={{
            maxWidth: "600px",
            margin: "40px auto",
            background: "#ffffff",
            borderRadius: "16px",
            padding: "40px",
            border: "1px solid #e5e7eb",
          }}
        >
          <Heading
            style={{
              textAlign: "center",
              fontSize: "30px",
              color: "#111827",
            }}
          >
            Reset your password
          </Heading>

          <Text
            style={{
              fontSize: "16px",
              color: "#4b5563",
              lineHeight: "28px",
            }}
          >
            Hi <strong>{username}</strong>,
          </Text>

          <Text
            style={{
              fontSize: "16px",
              color: "#4b5563",
              lineHeight: "28px",
            }}
          >
            We received a request to reset the password for your account. Click
            the button below to choose a new password.
          </Text>

          <Section
            style={{
              textAlign: "center",
              margin: "35px 0",
            }}
          >
            <Button
              href={resetUrl}
              style={{
                backgroundColor: "#18181b",
                color: "#ffffff",
                padding: "16px 32px",
                borderRadius: "10px",
                textDecoration: "none",
                fontWeight: "600",
                fontSize: "16px",
              }}
            >
              Reset Password
            </Button>
          </Section>

          <Text
            style={{
              fontSize: "15px",
              color: "#6b7280",
              lineHeight: "26px",
            }}
          >
            If the button doesn't work, copy and paste this link into your
            browser:
          </Text>

          <Text
            style={{
              fontSize: "14px",
              wordBreak: "break-all",
              color: "#2563eb",
            }}
          >
            {resetUrl}
          </Text>

          <Hr />

          <Text
            style={{
              fontSize: "14px",
              color: "#6b7280",
              lineHeight: "24px",
            }}
          >
            This password reset link will expire after a limited time for your
            security.
          </Text>

          <Text
            style={{
              textAlign: "center",
              fontSize: "13px",
              color: "#9ca3af",
            }}
          >
            If you didn't request a password reset, you can safely ignore this
            email. Your password will remain unchanged.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}