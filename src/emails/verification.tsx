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

interface VerificationEmailProps {
  username: string;
  verifyUrl: string;
}

export default function VerificationEmail({
  username,
  verifyUrl,
}: VerificationEmailProps) {
  return (
    <Html>
      <Head />

      <Preview>Verify your email address</Preview>

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
            Verify your email
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
            Thanks for creating your account. Please confirm your email address
            by clicking the button below.
          </Text>

          <Section
            style={{
              textAlign: "center",
              margin: "35px 0",
            }}
          >
            <Button
              href={verifyUrl}
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
              Verify Email
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
            {verifyUrl}
          </Text>

          <Hr />

          <Text
            style={{
              textAlign: "center",
              fontSize: "13px",
              color: "#9ca3af",
            }}
          >
            If you didn't create this account, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}