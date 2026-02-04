import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useAdmin } from '../contexts/adminContext';

const { width, height } = Dimensions.get('window');

interface TermsAndConditionsProps {
  onAgree: (agreed: boolean) => void;
}

const TermsAndConditions: React.FC<TermsAndConditionsProps> = ({ onAgree }) => {
  const { isTablet } = useAdmin();
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [isAgreed, setIsAgreed] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Responsive values based on device type
  const responsiveValues = {
    // Container dimensions
    maxHeight: isTablet ? height * 0.7 : height * 0.9,
    containerPadding: isTablet ? 25 : 1,

    // Typography
    titleFontSize: isTablet ? 28 : 24,
    effectiveDateFontSize: isTablet ? 18 : 16,
    sectionTitleFontSize: isTablet ? 20 : 18,
    subSectionTitleFontSize: isTablet ? 18 : 16,
    paragraphFontSize: isTablet ? 18 : 16,
    bulletPointFontSize: isTablet ? 18 : 16,
    tableHeaderFontSize: isTablet ? 18 : 16,
    tableRowFontSize: isTablet ? 18 : 16,

    // Spacing
    titleMarginBottom: isTablet ? 15 : 10,
    effectiveDateMarginBottom: isTablet ? 25 : 20,
    sectionTitleMarginTop: isTablet ? 25 : 20,
    sectionTitleMarginBottom: isTablet ? 12 : 10,
    subSectionTitleMarginTop: isTablet ? 18 : 15,
    subSectionTitleMarginBottom: isTablet ? 10 : 8,
    paragraphMarginBottom: isTablet ? 18 : 15,
    bulletPointMarginBottom: isTablet ? 10 : 8,
    bulletPointMarginLeft: isTablet ? 15 : 10,
    tableHeaderMarginTop: isTablet ? 12 : 10,
    tableHeaderMarginBottom: isTablet ? 10 : 8,
    tableRowMarginBottom: isTablet ? 6 : 5,
    tableRowMarginLeft: isTablet ? 15 : 10,

    // Line heights
    paragraphLineHeight: isTablet ? 28 : 24,
    bulletPointLineHeight: isTablet ? 28 : 24,
    tableRowLineHeight: isTablet ? 24 : 20,

    // Agreement section
    agreementSectionPadding: isTablet ? 15 : 1,
    scrollPromptFontSize: isTablet ? 18 : 12,
    scrollPromptMarginBottom: isTablet ? 18 : 1,
    checkboxSize: isTablet ? 28 : 24,
    checkboxMarginRight: isTablet ? 15 : 2,
    checkboxBorderRadius: isTablet ? 6 : 4,
    checkmarkFontSize: isTablet ? 18 : 16,
    agreementTextFontSize: isTablet ? 18 : 16,
    checkboxContainerPadding: isTablet ? 12 : 1,

    // Border and shadow
    borderRadius: isTablet ? 15 : 12,
    borderWidth: isTablet ? 1.5 : 1,
    marginBottom: isTablet ? 25 : 20,
  };

  const handleScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const isScrolledToBottom =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - 20;

    if (isScrolledToBottom && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const handleCheckboxPress = () => {
    if (hasScrolledToBottom) {
      const newAgreedState = !isAgreed;
      setIsAgreed(newAgreedState);
      onAgree(newAgreedState);
    }
  };

  return (
    <View style={[styles.container, { maxHeight: responsiveValues.maxHeight }]}>
      {!hasScrolledToBottom && (
        <Text
          style={[
            styles.scrollPrompt,
            {
              fontSize: responsiveValues.scrollPromptFontSize,
              marginBottom: responsiveValues.scrollPromptMarginBottom,
            },
          ]}>
          Please scroll to the bottom to continue
        </Text>
      )}
      <ScrollView
        ref={scrollViewRef}
        style={[
          styles.scrollView,
          {
            borderRadius: responsiveValues.borderRadius,
            borderWidth: responsiveValues.borderWidth,
            marginBottom: responsiveValues.marginBottom,
          },
        ]}
        contentContainerStyle={[
          styles.scrollContent,
          {
            padding: responsiveValues.containerPadding,
          },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={true}>
        <Text
          style={[
            styles.title,
            {
              fontSize: responsiveValues.titleFontSize,
              marginBottom: responsiveValues.titleMarginBottom,
            },
          ]}>
          MaTalk AI – Privacy Policy v1.0
        </Text>

        <Text
          style={[
            styles.effectiveDate,
            {
              fontSize: responsiveValues.effectiveDateFontSize,
              marginBottom: responsiveValues.effectiveDateMarginBottom,
            },
          ]}>
          Effective Date: July 9, 2025
        </Text>

        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          Thank you for using MaTalk AI, an app by Verbali Inc. ("Verbali,"
          "we," "our," or "us"). This Privacy Policy describes how we collect,
          use, and protect your personal information when you use the MaTalk AI
          mobile application ("App") and related services.
        </Text>

        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          By using MaTalk AI, you agree to this policy. If you do not agree,
          please do not use the App.
        </Text>

        <Text
          style={[
            styles.sectionTitle,
            {
              fontSize: responsiveValues.sectionTitleFontSize,
              marginTop: responsiveValues.sectionTitleMarginTop,
              marginBottom: responsiveValues.sectionTitleMarginBottom,
            },
          ]}>
          1. Information We Collect
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          <Text style={styles.bold}>California Notice at Collection:</Text> We
          collect the categories of personal information described below for the
          purposes stated in Section 2.
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          We collect only the minimum data needed to provide and improve the
          MaTalk AI experience.
        </Text>

        <Text
          style={[
            styles.subSectionTitle,
            {
              fontSize: responsiveValues.subSectionTitleFontSize,
              marginTop: responsiveValues.subSectionTitleMarginTop,
              marginBottom: responsiveValues.subSectionTitleMarginBottom,
            },
          ]}>
          A. Information You Provide
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Parent/guardian name
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Email address or Google account
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Password
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Child's age group (optional, used for personalization)
        </Text>

        <Text
          style={[
            styles.subSectionTitle,
            {
              fontSize: responsiveValues.subSectionTitleFontSize,
              marginTop: responsiveValues.subSectionTitleMarginTop,
              marginBottom: responsiveValues.subSectionTitleMarginBottom,
            },
          ]}>
          B. User-Generated Content
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Images created or uploaded for AAC cards
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Text labels or custom phrases
        </Text>

        <Text
          style={[
            styles.subSectionTitle,
            {
              fontSize: responsiveValues.subSectionTitleFontSize,
              marginTop: responsiveValues.subSectionTitleMarginTop,
              marginBottom: responsiveValues.subSectionTitleMarginBottom,
            },
          ]}>
          C. Usage Data
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Device type and OS version
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • IP address
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • In-app activity (e.g., screen views, time spent)
        </Text>

        <Text
          style={[
            styles.subSectionTitle,
            {
              fontSize: responsiveValues.subSectionTitleFontSize,
              marginTop: responsiveValues.subSectionTitleMarginTop,
              marginBottom: responsiveValues.subSectionTitleMarginBottom,
            },
          ]}>
          D. Audio Data
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          We process ambient speech by streaming it securely to a third-party
          speech-to-text provider (e.g., OpenAI). Audio is not stored, and we do
          not retain voice recordings.
        </Text>

        <Text
          style={[
            styles.subSectionTitle,
            {
              fontSize: responsiveValues.subSectionTitleFontSize,
              marginTop: responsiveValues.subSectionTitleMarginTop,
              marginBottom: responsiveValues.subSectionTitleMarginBottom,
            },
          ]}>
          E. Camera and Photos
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          With your consent, the App may use your device camera to take photos
          of people and objects for use in communication cards and to
          personalize answers. These images are stored on your device only and
          are never uploaded to our servers or shared with third parties.
        </Text>

        <Text
          style={[
            styles.sectionTitle,
            {
              fontSize: responsiveValues.sectionTitleFontSize,
              marginTop: responsiveValues.sectionTitleMarginTop,
              marginBottom: responsiveValues.sectionTitleMarginBottom,
            },
          ]}>
          2. How We Use Your Information
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          We use your data to:
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Provide and maintain the service (contractual necessity)
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Personalize the app experience (with your consent)
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Process text, image, and speech input via third-party AI tools
          solely to deliver in-app content. These providers are contractually
          forbidden from using your data to train their models.
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Respond to support inquiries and prevent abuse (legitimate interest)
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Comply with legal obligations and protect user safety
        </Text>

        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          We do not sell or rent your personal data. We do not use it for
          advertising or behavioral tracking.
        </Text>

        <Text
          style={[
            styles.sectionTitle,
            {
              fontSize: responsiveValues.sectionTitleFontSize,
              marginTop: responsiveValues.sectionTitleMarginTop,
              marginBottom: responsiveValues.sectionTitleMarginBottom,
            },
          ]}>
          3. What Is Personal Information?
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          "Personal information" means any information that identifies, relates
          to, or could reasonably be linked with you or your household. This
          includes:
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Names, emails, and login credentials
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Child's age group
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • IP address and device identifiers
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Uploaded images or text tied to an account
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Transcribed speech tied to user profiles
        </Text>

        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          It does not include aggregated or anonymized information that cannot
          be re-linked to a specific individual.
        </Text>

        <Text
          style={[
            styles.sectionTitle,
            {
              fontSize: responsiveValues.sectionTitleFontSize,
              marginTop: responsiveValues.sectionTitleMarginTop,
              marginBottom: responsiveValues.sectionTitleMarginBottom,
            },
          ]}>
          4. Subscriptions & Payments
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          MaTalk AI is a subscription-based app. Payment is processed by Apple,
          Google, or Amazon; we never store your credit card data. Refunds
          follow the policies of the store where you purchased your
          subscription.
        </Text>

        <Text
          style={[
            styles.sectionTitle,
            {
              fontSize: responsiveValues.sectionTitleFontSize,
              marginTop: responsiveValues.sectionTitleMarginTop,
              marginBottom: responsiveValues.sectionTitleMarginBottom,
            },
          ]}>
          5. Children's Privacy – COPPA Compliance
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          MaTalk AI is designed to support communication for children under 13,
          but it is intended to be used under adult supervision.
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • We obtain verifiable parental consent through a combination of
          required payment and adult account creation.
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Children cannot use the app independently.
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Parents can review, update, or delete their child's data by
          contacting us (see Section 10).
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • If we discover data was collected without proper consent, we will
          delete it immediately.
        </Text>

        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          <Text style={styles.bold}>Parental Controls for Photos:</Text> Tapping
          Add in <Text style={styles.bold}>My People & Stuff</Text> every time
          by a double parental gate: first admin code set by the parent during
          onboarding and then a visual sequence gate, This prevents children
          from adding photos without adult assistance. Images captured are used
          only to create cards and personalize answers and remain on-device.
          They are strictly optional and can be disabled or deleted at any time.
        </Text>

        <Text
          style={[
            styles.sectionTitle,
            {
              fontSize: responsiveValues.sectionTitleFontSize,
              marginTop: responsiveValues.sectionTitleMarginTop,
              marginBottom: responsiveValues.sectionTitleMarginBottom,
            },
          ]}>
          6. Data Sharing with Service Providers
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          We may share data with trusted service providers that support the core
          operation of the App. These include services for:
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Cloud hosting and storage
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Speech and image processing
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Product analytics (non-identifiable aggregates only)
        </Text>

        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          All service providers are contractually required to handle your data
          securely and may only use it to deliver services to us. We do not
          allow them to use your data for their own purposes, including training
          AI models.
        </Text>

        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          For clarity, photos taken with the camera for cards are stored locally
          on your device and are not uploaded to our or any third-party servers.
        </Text>

        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          <Text style={styles.bold}>
            💬 Why we don't name specific vendors:
          </Text>{' '}
          We work with a small set of reputable providers, but reserve the right
          to change partners to improve service quality and security. If we make
          a material change in how your data is handled, we'll notify you in
          advance.
        </Text>

        <Text
          style={[
            styles.sectionTitle,
            {
              fontSize: responsiveValues.sectionTitleFontSize,
              marginTop: responsiveValues.sectionTitleMarginTop,
              marginBottom: responsiveValues.sectionTitleMarginBottom,
            },
          ]}>
          7. Data Retention & Deletion
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          We retain data only as long as needed to provide the service or comply
          with legal obligations:
        </Text>

        <Text
          style={[
            styles.tableHeader,
            {
              fontSize: responsiveValues.tableHeaderFontSize,
              marginTop: responsiveValues.tableHeaderMarginTop,
              marginBottom: responsiveValues.tableHeaderMarginBottom,
            },
          ]}>
          Data Type | Retention Period | After That
        </Text>
        <Text
          style={[
            styles.tableRow,
            {
              fontSize: responsiveValues.tableRowFontSize,
              lineHeight: responsiveValues.tableRowLineHeight,
              marginBottom: responsiveValues.tableRowMarginBottom,
              marginLeft: responsiveValues.tableRowMarginLeft,
            },
          ]}>
          Account info & content | 30 days after account deletion/inactivity |
          Deleted or anonymized
        </Text>
        <Text
          style={[
            styles.tableRow,
            {
              fontSize: responsiveValues.tableRowFontSize,
              lineHeight: responsiveValues.tableRowLineHeight,
              marginBottom: responsiveValues.tableRowMarginBottom,
              marginLeft: responsiveValues.tableRowMarginLeft,
            },
          ]}>
          Usage logs | 30 days after account deletion | Deleted
        </Text>
        <Text
          style={[
            styles.tableRow,
            {
              fontSize: responsiveValues.tableRowFontSize,
              lineHeight: responsiveValues.tableRowLineHeight,
              marginBottom: responsiveValues.tableRowMarginBottom,
              marginLeft: responsiveValues.tableRowMarginLeft,
            },
          ]}>
          Transcription results | Temporary (not stored) | Not retained
        </Text>

        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          You may request deletion sooner at any time (see Section 10).
        </Text>

        <Text
          style={[
            styles.sectionTitle,
            {
              fontSize: responsiveValues.sectionTitleFontSize,
              marginTop: responsiveValues.sectionTitleMarginTop,
              marginBottom: responsiveValues.sectionTitleMarginBottom,
            },
          ]}>
          8. Security Measures
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          We use technical and organizational safeguards to protect your data,
          including:
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • End-to-end encryption (TLS 1.2+) and encryption at rest (AES-256)
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Multi-factor authentication for internal access
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Access logging and role-based controls
        </Text>

        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          In the event of a data breach, we will notify affected users and
          regulators within 72 hours as required by law.
        </Text>

        <Text
          style={[
            styles.sectionTitle,
            {
              fontSize: responsiveValues.sectionTitleFontSize,
              marginTop: responsiveValues.sectionTitleMarginTop,
              marginBottom: responsiveValues.sectionTitleMarginBottom,
            },
          ]}>
          9. Your Privacy Rights
        </Text>

        <Text
          style={[
            styles.subSectionTitle,
            {
              fontSize: responsiveValues.subSectionTitleFontSize,
              marginTop: responsiveValues.subSectionTitleMarginTop,
              marginBottom: responsiveValues.subSectionTitleMarginBottom,
            },
          ]}>
          California Residents (CCPA/CPRA)
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          If you live in California, you have the right to:
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Know what personal information we collect
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Access or request deletion of your data
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Correct inaccurate personal information
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Limit use of sensitive personal data (e.g., child's age group)
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Be free from discrimination for exercising any of these rights
        </Text>

        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          We do not sell or share your personal information for advertising
          purposes.
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          To exercise your rights, email: privacy@verbali.io. We will respond
          within 45 days.
        </Text>

        <Text
          style={[
            styles.subSectionTitle,
            {
              fontSize: responsiveValues.subSectionTitleFontSize,
              marginTop: responsiveValues.subSectionTitleMarginTop,
              marginBottom: responsiveValues.subSectionTitleMarginBottom,
            },
          ]}>
          Canada (PIPEDA)
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          Canadian users may:
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Access or correct their information
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Withdraw consent at any time
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • Request deletion
        </Text>
        <Text
          style={[
            styles.bulletPoint,
            {
              fontSize: responsiveValues.bulletPointFontSize,
              lineHeight: responsiveValues.bulletPointLineHeight,
              marginBottom: responsiveValues.bulletPointMarginBottom,
              marginLeft: responsiveValues.bulletPointMarginLeft,
            },
          ]}>
          • File a complaint with the Office of the Privacy Commissioner of
          Canada
        </Text>

        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          Withdrawing consent may limit your ability to use the app.
        </Text>

        <Text
          style={[
            styles.sectionTitle,
            {
              fontSize: responsiveValues.sectionTitleFontSize,
              marginTop: responsiveValues.sectionTitleMarginTop,
              marginBottom: responsiveValues.sectionTitleMarginBottom,
            },
          ]}>
          10. International Use
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          MaTalk AI is operated from the United States. If you access the app
          from outside the U.S. or Canada, your data may be transferred to
          servers in the U.S., where it is subject to U.S. law.
        </Text>

        <Text
          style={[
            styles.sectionTitle,
            {
              fontSize: responsiveValues.sectionTitleFontSize,
              marginTop: responsiveValues.sectionTitleMarginTop,
              marginBottom: responsiveValues.sectionTitleMarginBottom,
            },
          ]}>
          11. Changes to This Policy
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          We may update this Privacy Policy periodically. You'll be notified
          in-app or via email before any material change takes effect. Archived
          versions are available upon request.
        </Text>

        <Text
          style={[
            styles.sectionTitle,
            {
              fontSize: responsiveValues.sectionTitleFontSize,
              marginTop: responsiveValues.sectionTitleMarginTop,
              marginBottom: responsiveValues.sectionTitleMarginBottom,
            },
          ]}>
          12. Service & Hardware Support Policy
        </Text>

        <Text
          style={[
            styles.subSectionTitle,
            {
              fontSize: responsiveValues.subSectionTitleFontSize,
              marginTop: responsiveValues.subSectionTitleMarginTop,
              marginBottom: responsiveValues.subSectionTitleMarginBottom,
            },
          ]}>
          A. AI Support
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          Verbali will provide support for AI features for a period of three (3) years
          from the date of purchase. Following this three-year period, AI support will
          cease, and the user will need to purchase a new AI package to continue
          accessing these features.
        </Text>

        <Text
          style={[
            styles.subSectionTitle,
            {
              fontSize: responsiveValues.subSectionTitleFontSize,
              marginTop: responsiveValues.subSectionTitleMarginTop,
              marginBottom: responsiveValues.subSectionTitleMarginBottom,
            },
          ]}>
          B. Maintenance & Upgrades
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          Verbali will provide version upgrades and maintenance for a period of three
          (3) years. Following this three-year period, we will stop providing
          upgrades, and the user will need to purchase a new maintenance package to
          receive further updates.
        </Text>

        <Text
          style={[
            styles.subSectionTitle,
            {
              fontSize: responsiveValues.subSectionTitleFontSize,
              marginTop: responsiveValues.subSectionTitleMarginTop,
              marginBottom: responsiveValues.subSectionTitleMarginBottom,
            },
          ]}>
          C. Hardware Support
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          We will attempt to support all hardware devices within reason. However, we
          reserve the right to discontinue support for older models or specific iOS
          or Android versions that are no longer viable to maintain.
        </Text>

        <Text
          style={[
            styles.sectionTitle,
            {
              fontSize: responsiveValues.sectionTitleFontSize,
              marginTop: responsiveValues.sectionTitleMarginTop,
              marginBottom: responsiveValues.sectionTitleMarginBottom,
            },
          ]}>
          13. Contact Us
        </Text>
        <Text
          style={[
            styles.paragraph,
            {
              fontSize: responsiveValues.paragraphFontSize,
              lineHeight: responsiveValues.paragraphLineHeight,
              marginBottom: responsiveValues.paragraphMarginBottom,
            },
          ]}>
          Verbali Inc.{'\n'}
          12345 Parklawn Drive, Suite 200{'\n'}
          Rockville, MD 20852, USA{'\n'}
          General inquiries: info@verbali.io{'\n'}
          Privacy inquiries or data requests: info@verbali.io
        </Text>
      </ScrollView>

      <View
        style={[
          styles.agreementSection,
          {
            flexDirection: isTablet ? 'column' : 'row',
          },
          {
            paddingVertical: responsiveValues.agreementSectionPadding,
          },
        ]}>
        <TouchableOpacity
          style={[
            styles.checkboxContainer,
            { paddingVertical: responsiveValues.checkboxContainerPadding },
            !hasScrolledToBottom && styles.disabledCheckbox,
          ]}
          onPress={handleCheckboxPress}
          disabled={!hasScrolledToBottom}>
          <View
            style={[
              styles.checkbox,
              {
                width: responsiveValues.checkboxSize,
                height: responsiveValues.checkboxSize,
                borderRadius: responsiveValues.checkboxBorderRadius,
                marginRight: responsiveValues.checkboxMarginRight,
              },
              isAgreed && styles.checkedBox,
            ]}>
            {isAgreed && (
              <Text
                style={[
                  styles.checkmark,
                  {
                    fontSize: responsiveValues.checkmarkFontSize,
                  },
                ]}>
                ✓
              </Text>
            )}
          </View>
          <Text
            style={[
              styles.agreementText,
              { fontSize: responsiveValues.agreementTextFontSize },
              !hasScrolledToBottom && styles.disabledText,
            ]}>
            I agree to the Privacy Policy
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    // maxHeight handled by responsive values
  },
  scrollView: {
    flex: 1,
    backgroundColor: 'white',
    borderColor: '#ddd',
    // borderRadius, borderWidth, marginBottom handled by responsive values
  },
  scrollContent: {
    // padding handled by responsive values
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333',
    // fontSize, marginBottom handled by responsive values
  },
  effectiveDate: {
    textAlign: 'center',
    color: '#666',
    fontStyle: 'italic',
    // fontSize, marginBottom handled by responsive values
  },
  sectionTitle: {
    fontWeight: 'bold',
    color: '#333',
    // fontSize, marginTop, marginBottom handled by responsive values
  },
  subSectionTitle: {
    fontWeight: 'bold',
    color: '#333',
    // fontSize, marginTop, marginBottom handled by responsive values
  },
  paragraph: {
    color: '#555',
    textAlign: 'justify',
    // fontSize, lineHeight, marginBottom handled by responsive values
  },
  bulletPoint: {
    color: '#555',
    // fontSize, lineHeight, marginBottom, marginLeft handled by responsive values
  },
  bold: {
    fontWeight: 'bold',
  },
  tableHeader: {
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'left',
    // fontSize, marginTop, marginBottom handled by responsive values
  },
  tableRow: {
    color: '#555',
    // fontSize, lineHeight, marginBottom, marginLeft handled by responsive values
  },
  lastUpdated: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 30,
    color: '#777',
  },
  agreementSection: {
    alignItems: 'center',

    // paddingVertical handled by responsive values
  },
  scrollPrompt: {
    color: '#FF6B6B',
    fontWeight: '600',
    textAlign: 'center',
    // fontSize, marginBottom handled by responsive values
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    // paddingVertical handled by responsive values
  },
  disabledCheckbox: {
    opacity: 0.5,
  },
  checkbox: {
    borderWidth: 2,
    borderColor: '#8E24AA',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
    // width, height, borderRadius, marginRight handled by responsive values
  },
  checkedBox: {
    backgroundColor: '#8E24AA',
  },
  checkmark: {
    color: 'white',
    fontWeight: 'bold',
    // fontSize handled by responsive values
  },
  agreementText: {
    color: '#333',
    fontWeight: '600',
    flex: 1,
    // fontSize handled by responsive values
  },
  disabledText: {
    color: '#999',
  },
});

export default TermsAndConditions;
