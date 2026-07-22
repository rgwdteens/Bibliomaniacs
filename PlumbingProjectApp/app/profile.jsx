import React, { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, Modal, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { auth, app } from "../backend/firebaseConfig";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, updateDoc, deleteField } from "firebase/firestore";
import axios from "axios";
  

export default function ProfilePage() {
    const router = useRouter();
    const db = getFirestore(app);

    const [loading, setLoading] = useState(true);
    const [userUid, setUserUid] = useState(null);

    const [role, setRole] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);

    const [first_name, setFirstName] = useState("");
    const [last_name, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [grade, setGrade] = useState("");
    const [school, setSchool] = useState("");
    const [genres, setGenres] = useState([]);

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

    const [modalVisible, setModalVisible] = useState(false);
    const [genreDropdownOpen, setGenreDropdownOpen] = useState(false);

    const [editFirstName, setEditFirstName] = useState("");
    const [editLastName, setEditLastName] = useState("");
    const [editPhone, setEditPhone] = useState("");
    const [editGrade, setEditGrade] = useState("");
    const [editSchool, setEditSchool] = useState("");
    const [editGenres, setEditGenres] = useState([]);

    const gradeOptions = ["6", "7", "8", "9", "10", "11", "12"];


    const openModal = () => {
        setEditFirstName(first_name);
        setEditLastName(last_name);
        setEditPhone(phone);
        setEditGrade(grade);
        setEditSchool(school);
        setEditGenres(genres);
        setModalVisible(true);
    };

    const toggleGenre = (genre) => {
        if (editGenres.includes(genre)) {
            setEditGenres(editGenres.filter((g) => g !== genre));
        } else {
            setEditGenres([...editGenres, genre]);
        }
    };

    const loadProfile = async (uid) => {
        setLoading(true);
        try {
          const userRef = doc(db, "users", uid);
          const snap = await getDoc(userRef);
    
          if (snap.exists()) {
            const data = snap.data();
    
            // Missing fields stay as empty strings / empty arrays in UI state
            setFirstName(data.first_name ?? "");
            setLastName(data.last_name ?? "");
            setPhone(data.phone ?? "");
            setGrade(data.grade ?? "");
            setSchool(data.school ?? "");
            setGenres(Array.isArray(data.favoriteGenres) ? data.favoriteGenres : []);
          } else {
            // If doc doesn't exist for some reason, just show blanks
            setFirstName("");
            setLastName("");
            setPhone("");
            setGrade("");
            setSchool("");
            setGenres([]);
          }
        } finally {
          setLoading(false);
        }
    };

    const saveProfile = async () => {
        if (!userUid) return;

        const userRef = doc(db, "users", userUid);

        const updates = {};

        const fn = editFirstName.trim();
        if (fn) updates.first_name = fn;
        else updates.first_name = deleteField();

        const ln = editLastName.trim();
        if (ln) updates.last_name = ln;
        else updates.last_name = deleteField();

        const p = editPhone.trim();
        if (p) updates.phone = p;
        else updates.phone = deleteField();

        if (editGrade) updates.grade = editGrade;
        else updates.grade = deleteField();

        const s = editSchool.trim();
        if (s) updates.school = s;
        else updates.school = deleteField();

        if (editGenres.length > 0) updates.favoriteGenres = editGenres;
        else updates.favoriteGenres = deleteField();

        await updateDoc(userRef, updates);

        setFirstName(fn);
        setLastName(ln);
        setPhone(p);
        setGrade(editGrade);
        setSchool(s);
        setGenres(editGenres);

        setModalVisible(false);
    };

useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (!user) {
            setUserUid(null);
            setEmail("");
            setLoading(false);
            setCurrentUser(null);
            setRole(null);
            return;
        }

        setUserUid(user.uid);
        setCurrentUser(user);
        setEmail(user.email ?? "");
        await loadProfile(user.uid);

        try {
            const idToken = await user.getIdToken(true);
            const res = await axios.post("https://bibliomaniacs-ytnd.onrender.com/verify_token", { idToken });
            setRole(res.data.role);
        } catch (err) {
            console.error("Failed to fetch role:", err);
            setRole("user");
        }
    });

    return unsubscribe;
}, []);

const handleLogout = async () => {
    try {
        await signOut(auth);
        setCurrentUser(null);
        setRole(null);
        console.log("Logged out");
        router.push("/landingpage");
    } catch (error) {
        console.log("Logout Failed", error.message);
    }
};

return (
        <View className="flex-1 bg-[#f5fdf5] px-5 py-6">
            <Text className="profileH1">Profile</Text>

            <View className="profileCard">
                <View className="flex-1">
                    <Text className="profileName">{`${first_name} ${last_name}`.trim()|| "Unnamed User"}</Text>
                    <Text className="profileEmail">{email || "--"}</Text>
                    <Text className="profileRole">
                    {role === "admin" ? "Bibliomaniacs Admin" : "Bibliomaniacs Reviewer"}
                    </Text>
                </View>
            </View>

            <View className="profileInfoCard">
                <Text className="sectionTitle">Account Information</Text>

                <View className="infoRow">
                    <Text className="infoLabel">Phone Number</Text>
                    <Text className="infoValue">{phone || "--"}</Text>
                </View>
{role !== "admin" && (
  <>
    <View className="infoRow">
      <Text className="infoLabel">Grade</Text>
      <Text className="infoValue">{grade || "--"}</Text>
    </View>

    <View className="infoRow">
      <Text className="infoLabel">School</Text>
      <Text className="infoValue">{school || "--"}</Text>
    </View>

    <View className="infoRow">
      <Text className="infoLabel">Favorite Genres</Text>
      {genres.length === 0 ? (
        <Text className="infoValue text-neutral-500">None selected</Text>
      ) : (
        <View className="genresContainer">
          {genres.map((g) => (
            <View key={g} className="genreChip">
              <Text className="genreChipText">{g}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  </>
)}
            </View>
            <View className="profileCtaRow">
                <Pressable className="primaryBtn editBtn" onPress={openModal}>
                    <Text className="primaryText text-center">Edit Profile</Text>
                </Pressable>

                <Pressable
                    className="landingSecondaryBtn editBtnOut"
                    onPress={handleLogout}>
                    <Text className="landingSecondaryText text-center">Log Out</Text>
                </Pressable>
            </View>

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
                            <Text className="modalTitle">Edit Profile</Text>

                            <Text className="inputLabel">Name</Text>
                            <View className="flex-row gap-3 mb-2">
                                <TextInput
                                    className="modalInput flex-1"
                                    placeholder="First name"
                                    value={editFirstName}
                                    onChangeText={setEditFirstName}
                                />

                                <TextInput
                                    className="modalInput flex-1"
                                    placeholder="Last name"
                                    value={editLastName}
                                    onChangeText={setEditLastName}
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
                                value={editPhone}
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
                                    setEditPhone(formatted);
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
                                                className={`gradeOption ${editGrade === level ? "gradeOptionActive" : ""}`}
                                                onPress={() => setEditGrade(level)}
                                            >
                                                <Text className={`gradeText ${editGrade === level ? "gradeTextActive" : ""}`}>
                                                    {level}
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </ScrollView>

                                    <Text className="inputLabel">School</Text>
                                    <TextInput
                                        className="modalInput"
                                        value={editSchool}
                                        onChangeText={setEditSchool}
                                    />

                                    <Text className="inputLabel">Favorite Genres</Text>
                                    <Pressable
                                        className="dropdownBtn"
                                        onPress={() => setGenreDropdownOpen(!genreDropdownOpen)}
                                    >
                                        <Text className="dropdownBtnText">
                                            {editGenres.length ? editGenres.join(", ") : "Select genres"}
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
                                                            className={`checkbox ${editGenres.includes(genre)
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

                            <View className="buttonRow mt-4">
                                <Pressable className="primaryBtn flex-1" onPress={saveProfile}>
                                    <Text className="primaryText text-center">Save</Text>
                                </Pressable>

                                <Pressable
                                    className="secondaryBtn flex-1"
                                    onPress={() => setModalVisible(false)}
                                >
                                    <Text className="secondaryText text-center">Cancel</Text>
                                </Pressable>
                            </View>

                        </ScrollView>
                    </View>
                </View>
            </Modal>

        </View>
    );
}
