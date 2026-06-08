import React, { useEffect, useState, useRef } from "react";
import {
    View,
    Text,
    Pressable,
    TextInput,
    Modal,
    ScrollView,
} from "react-native";
import { Star } from "lucide-react-native";
import { auth, app } from "../backend/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc, updateDoc, deleteField } from "firebase/firestore";

export default function ReviewModal({
    modalVisible,
    setModalVisible,
    bookTitle,
    handleTitleChange,
    authorName,
    setAuthorName,
    review,
    setReview,
    titleFlagged,
    gradeLevel,
    setGradeLevel,
    school,
    setSchool,
    email,
    setEmail,
    phoneNumber,
    setPhoneNumber,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    recommendedGrades,
    toggleRecommendedGrade,
    anonPref,
    setAnonPref,
    rating,
    setRating,
    gradeOptions,
    anonOptions,
    onSubmit,
    isEditMode,
    titleCheckLoading,
    reviewWordCount
}) {

    function formatPhoneNumber(text) {
        const cleaned = text.replace(/\D/g, "");

        if (cleaned.length <= 3) return cleaned;
        if (cleaned.length <= 6) return `(${cleaned.slice(0,3)}) ${cleaned.slice(3)}`;

        return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6,10)}`;
    }

    const [requiredError, setRequiredError] = useState(false);
    const [failedSubmit, setFailedSubmit] = useState(false);
    const [contentFlags, setContentFlags] = useState([]);
    const [contentChecking, setContentChecking] = useState(false);
    const debounceRef = useRef(null);
    useEffect(() => {
        if (!review.trim()) {
            setContentFlags([]);
            return;
        }
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setContentChecking(true);
            try {
                const res = await fetch("https://bibliomaniacs.onrender.com/check_content", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: review }),
                });
                const data = await res.json();
                setContentFlags(data.flags || []);
            } catch {
                setContentFlags([]);
            } finally {
                setContentChecking(false);
            }
        }, 800); // debounce 800ms
    }, [review]);

const handleSubmit = () => {
    const wordCount = review.trim().split(/\s+/).filter(Boolean).length;

    if (!bookTitle.trim() || !authorName.trim() || !firstName.trim() ||
        !lastName.trim() || !review.trim() || !gradeLevel ||
        !recommendedGrades || !rating || !school.trim() ||
        !email.trim() || !phoneNumber.trim() || !anonPref.trim() || wordCount < 200) {
        setRequiredError(true);
        setFailedSubmit(true);
        return;
    }

    if (contentFlags.length > 0) {
        setFailedSubmit(true);
        return;
    }

    setRequiredError(false);
    setFailedSubmit(false);
    onSubmit();
};

    return (
        <Modal
            transparent
            animationType="slide"
            visible={modalVisible}
            onRequestClose={() => setModalVisible(false)}
        >
            <View className="modalBackdrop">
                <View className="modalCard">
                    <ScrollView
                        className="modalScroll"
                        contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 }}
                    >
                        <Text className="modalTitle">
                            {isEditMode ? "Edit Review" : "New Book Review"}
                        </Text>


                        <Text className="inputLabel">
                            Book Title <Text style={{ color: "red" }}>*</Text>
                        </Text>
                        <TextInput
                            className="modalInput"
                            placeholder="Book title"
                            value={bookTitle}
                            onChangeText={handleTitleChange}
                        />

                        {titleCheckLoading && (
                        <Text className="text-xs text-gray-400 mb-2">Checking title...</Text>
                        )}

                        {titleFlagged && !titleCheckLoading && (
                        <View className="warningBox">
                            <View className="flex-1">
                            <Text className="warningTitle">Already popular title</Text>
                            <Text className="warningText">
                                This book has already been reviewed many times. Consider
                                reviewing a different book.
                            </Text>
                            </View>
                        </View>
                        )}

<                       Text className="inputLabel">
                            Author Name <Text style={{ color: "red" }}>*</Text>
                        </Text>
                        <TextInput
                            className="modalInput"
                            placeholder="Author name"
                            value={authorName}
                            onChangeText={setAuthorName}
                        />

                        <Text className="inputLabel">
                            Reviewer Name <Text style={{ color: "red" }}>*</Text>
                        </Text>

                        <View className="flex-row gap-3 mb-2">
                            <TextInput
                                className="modalInput flex-1"
                                placeholder="First name"
                                value={firstName}
                                onChangeText={setFirstName}
                            />

                            <TextInput
                                className="modalInput flex-1"
                                placeholder="Last name"
                                value={lastName}
                                onChangeText={setLastName}
                            />
                        </View>

                        <Text className="inputLabel">
                            Email <Text style={{ color: "red" }}>*</Text>
                        </Text>
                        <TextInput
                            className="modalInput"
                            placeholder="Email"
                            value={email}
                            onChangeText={setEmail}
                        />
                        <Text className="inputLabel">
                            Phone Number <Text style={{ color: "red" }}>*</Text>
                        </Text>

                        <TextInput
                        className="modalInput"
                        value={phoneNumber}
                        keyboardType="phone-pad"
                        maxLength={14}
                        placeholder="(123) 456-7890"
                        onChangeText={(text) => {
                            const formatted = formatPhoneNumber(text);
                            setPhoneNumber(formatted);
                        }}
                        />

                        <Text className="inputLabel">
                            School <Text style={{ color: "red" }}>*</Text>
                        </Text>
                        <TextInput
                            className="modalInput"
                            placeholder="School"
                            value={school}
                            onChangeText={setSchool}
                        />

                        <Text className="inputLabel">
                            Review <Text style={{ color: "red" }}>*</Text>
                        </Text>
                        <TextInput
                            className="modalTextarea"
                            placeholder="Write your review..."
                            multiline
                            value={review}
                            onChangeText={setReview}
                        />
                        {contentChecking && (
                        <Text style={{ color: "#888", fontSize: 12, marginBottom: 4 }}>
                            Checking review content...
                        </Text>
                    )}

                    {contentFlags.map((flag) => (
                        <View key={flag.type} style={{
                            backgroundColor: "#fff3cd",
                            borderColor: "#ffc107",
                            borderWidth: 1,
                            borderRadius: 6,
                            padding: 10,
                            marginBottom: 8,
                        }}>
                            <Text style={{ fontWeight: "700", color: "#856404", fontSize: 13 }}>
                                Content Issue
                            </Text>
                            <Text style={{ color: "#856404", fontSize: 12, marginTop: 2 }}>
                                {flag.message}
                            </Text>
                        </View>
                    ))}


                        <Text style={{ 
                            color: reviewWordCount >= 200 ? "#2b7a4b" : "#cc0000", 
                            fontSize: 12, 
                            marginBottom: 8,
                            marginTop: 4
                        }}>
                            {reviewWordCount} / 200 words minimum{reviewWordCount >= 200 ? " ✓" : ""}
                        </Text>

                        <Text className="inputLabel">
                            Grade Level <Text style={{ color: "red" }}>*</Text>
                        </Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            className="gradeRow"
                        >

                            {gradeOptions.map((level) => (
                                <Pressable
                                    key={level}
                                    className={`gradeOption ${gradeLevel === String(level) ? "gradeOptionActive" : ""}`}
                                    onPress={() => setGradeLevel(level)}
                                >
                                    <Text className={`gradeText ${gradeLevel === level ? "gradeTextActive" : ""}`}>
                                    {level}
                                    </Text>
                                </Pressable>
                                ))}
                        </ScrollView>

                        <Text className="inputLabel">
                            Recommended Grade Levels <Text style={{ color: "red" }}>*</Text>
                        </Text>
                        <View className="flex-row flex-wrap mb-3">
                            {gradeOptions.map((level) => (
                                <Pressable
                                    key={level}
                                    className={`gradeOption ${recommendedGrades.includes(level) ? "gradeOptionActive" : ""
                                        }`}
                                    onPress={() => toggleRecommendedGrade(level)}
                                >
                                    <Text
                                        className={`gradeText ${recommendedGrades.includes(level) ? "gradeTextActive" : ""
                                            }`}
                                    >
                                        {level}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>

                        <Text className="inputLabel">Anonymous Preference</Text>
                        <View className="radioRow">
                            {anonOptions.map((opt) => (
                                <Pressable
                                    key={opt}
                                    className={`radioOption ${anonPref === opt ? "radioOptionActive" : ""
                                        }`}
                                    onPress={() => setAnonPref(opt)}
                                >
                                    <View
                                        className={`radioCircle ${anonPref === opt ? "radioCircleActive" : ""
                                            }`}
                                    />
                                    <Text
                                        className={`radioText ${anonPref === opt ? "radioTextActive" : ""
                                            }`}
                                    >
                                        {opt}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>

                        <Text className="inputLabel">
                            Rating <Text style={{ color: "red" }}>*</Text>
                        </Text>
                        <View className="flex-row mb-3">
                            {[1, 2, 3, 4, 5].map((num) => (
                                <Pressable key={num} onPress={() => setRating(num)}>
                                    <Star
                                        size={28}
                                        color={num <= rating ? "#2b7a4b" : "#b6d5b6"}
                                        fill={num <= rating ? "#2b7a4b" : "none"}
                                        style={{ marginRight: 6 }}
                                    />
                                </Pressable>
                            ))}
                        </View>

                    {(requiredError || contentFlags.length > 0) && failedSubmit && (
                        <View className="requiredBox">
                            <View className="flex-1">
                                <Text className="requiredTitle">Cannot submit</Text>
                                <Text className="requiredText">
                                    {contentFlags.length > 0
                                        ? "Please fix the content issues flagged above before submitting."
                                        : `Please fill all required fields${reviewWordCount < 200 && reviewWordCount > 0
                                            ? ` (review needs ${200 - reviewWordCount} more words)`
                                            : ""}`}
                                </Text>
                            </View>
                        </View>
                    )}

                        <View className="buttonRow mt-1">
                            <Pressable
                                className="primaryBtn flex-1"
                                onPress={handleSubmit}
                            >
                                <Text className="primaryText">
                                    {isEditMode ? "Update Review" : "Submit"}
                                </Text>

                            </Pressable>

                            <Pressable
                                className="secondaryBtn flex-1"
                                onPress={() => setModalVisible(false)}
                            >
                                <Text className="secondaryText">Cancel</Text>
                            </Pressable>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}