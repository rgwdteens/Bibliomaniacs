import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { auth, app } from "../backend/firebaseConfig";
import { getFirestore, doc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export default function ProfileSetup() {
    const router = useRouter();
    const db = getFirestore(app);

    const [first_name, setFirstName] = useState("");
    const [last_name, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [grade, setGrade] = useState("");
    const [school, setSchool] = useState("");
    const [genres, setGenres] = useState([]);
    const [role, setRole] = useState(null);


    const GENRE_OPTIONS = [
        "Fantasy",
        "Sci-Fi",
        "Mystery",
        "Romance",
        "Thriller",
        "Non-fiction",
        "Biography",
        "Historical Fiction",
        "Horror",
        "Young Adult",
    ];

    const [genreDropdownOpen, setGenreDropdownOpen] = useState(false);

    const gradeOptions = Array.from({ length: 13 }, (_, i) =>
        i === 0 ? "K" : i.toString()
    );

    const toggleGenre = (genre) => {
        if (genres.includes(genre)) {
            setGenres(genres.filter((g) => g !== genre));
        } else {
            setGenres([...genres, genre]);
        }
    };

    const handleSubmit = async () => {
        const user = auth.currentUser;
        if (!user) return;

        const userRef = doc(db, "users", user.uid);

        const updates = {};

        if (first_name.trim()) updates.first_name = first_name.trim();
        if (last_name.trim()) updates.last_name = last_name.trim();
        if (phone.trim()) updates.phone = phone.trim();
        if (grade) updates.grade = grade;
        if (school.trim()) updates.school = school.trim();
        if (genres.length > 0) updates.favoriteGenres = genres;

        try {
            await updateDoc(userRef, updates);
            Alert.alert("Profile Saved", "Your profile is now complete!");
            if (role === "admin") {
                router.replace("/adminhomepage");
            } else {
                console.log("user role: ", user.role);
                router.replace("/homepage");
            }
            
        } catch (err) {
            console.log("Profile Setup Error:", err);
            Alert.alert("Error", "Could not save profile.");
        }
    };

    useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
            setEmail(user.email);
            try {
                const idToken = await user.getIdToken(true);
                const res = await axios.post("https://bibliomaniacs.onrender.com/verify_token", { idToken });
                setRole(res.data.role);
            } catch {
                setRole("user");
            }
        } else {
            setEmail("");
            setRole(null);
        }
    });
    return unsubscribe;
}, []);

    return (
        <ScrollView className="w-full min-h-screen bg-[#eef1ee] px-6 py-10">
            <Text className="text-3xl font-extrabold text-center text-[#224c2f] mb-6">
                Complete Your Profile
            </Text>

            <View className="w-full max-w-[720px] self-center bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
                <Text className="inputLabel">Name</Text>
                <View className="flex-row gap-3 mb-2">
                    <TextInput
                        className="modalInput flex-1"
                        placeholder="Enter your first name"
                        value={first_name}
                        onChangeText={setFirstName}
                    />

                    <TextInput
                        className="modalInput flex-1"
                        placeholder="Enter your last name"
                        value={last_name}
                        onChangeText={setLastName}
                    />
                </View>

                <Text className="inputLabel">Email</Text>
                <View pointerEvents="none">
                    <TextInput
                        className="modalInput modalInputDisabled"
                        value={email}
                        editable={false}
                        focusable={false}
                    />
                </View>

                <Text className="inputLabel">Phone Number</Text>
                <TextInput
                    className="modalInput"
                    value={phone}
                    placeholder="Enter your phone number"
                    keyboardType="phone-pad"
                    maxLength={14}
                    onChangeText={(text) => {
                        const cleaned = text.replace(/\D/g, "");

                        let formatted = cleaned;

                        if (cleaned.length > 3 && cleaned.length <= 6) {
                            formatted = `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
                        } else if (cleaned.length > 6) {
                            formatted = `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
                        }

                        setPhone(formatted);
                    }}
                />
{role !== "admin" && (
  <>
                <Text className="inputLabel">Grade Level</Text>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="gradeRow"
                >
                    {gradeOptions.map((level) => (
                        <Pressable
                            key={level}
                            className={`gradeOption ${grade === level ? "gradeOptionActive" : ""
                                }`}
                            onPress={() => setGrade(level)}
                        >
                            <Text
                                className={`gradeText ${grade === level ? "gradeTextActive" : ""
                                    }`}
                            >
                                {level}
                            </Text>
                        </Pressable>
                    ))}
                </ScrollView>

                <Text className="inputLabel">School</Text>
                <TextInput
                    className="modalInput"
                    value={school}
                    placeholder="Enter your school name"
                    onChangeText={setSchool}
                />

                <Text className="inputLabel">Favorite Genres</Text>
                <Pressable
                    className="dropdownBtn"
                    onPress={() => setGenreDropdownOpen(!genreDropdownOpen)}
                >
                    <Text className="dropdownBtnText">
                        {genres.length ? genres.join(", ") : "Select genres"}
                    </Text>
                </Pressable>

                {genreDropdownOpen && (
                    <View className="dropdownList">
                        <ScrollView className="dropdownScroll">
                            {GENRE_OPTIONS.map((genre) => (
                                <Pressable
                                    key={genre}
                                    className="dropdownItem"
                                    onPress={() => toggleGenre(genre)}
                                >
                                    <Text className="dropdownItemText">{genre}</Text>
                                    <View
                                        className={`checkbox ${genres.includes(genre)
                                            ? "checkboxChecked"
                                            : "checkboxUnchecked"
                                            }`}
                                    />
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                )}
</>
                )}

                <Pressable onPress={handleSubmit} className="primaryBtn mt-6 self-center w-[200px]">
                    <Text className="primaryText text-center">Finish</Text>
                </Pressable>
            </View>
        </ScrollView>
    );
}
