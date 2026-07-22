import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { RequireAccess } from "../components/requireaccess";
import React, { useState, useEffect, useRef } from "react";
import { getAuth } from "firebase/auth";
import { auth, app } from "../backend/firebaseConfig";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";
import { Mail, MailCheck, Filter, Scroll } from "lucide-react";
import { Ionicons, Octicons, FontAwesome5, AntDesign, Feather } from "@expo/vector-icons";
import logoUrl from '../assets/logo.png';


export default function ArchiveScreen() {
    const [search, setSearch] = useState("");
    const [sortOrder, setSortOrder] = useState("newest");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [gradeLevel, setGradeLevel] = useState("");
    const [school, setSchool] = useState("");
    const [email, setEmail] = useState("");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [anonPref, setAnonPref] = useState("");
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [openRows, setOpenRows] = useState({});
    const [pastCertificates, setPastCertificates] = useState([]);    

    const debounceTimer = useRef(null);

    const statusColor = {
        Approved: "#2b7a4b",
        Pending: "#cc9a06",
        Rejected: "#c0392b",
    };

    const db = getFirestore(app);

    const approvedReviews = reviews.filter(r => r.status === "Approved").length;
    const volunteerHours = (approvedReviews * 0.5).toFixed(1);

    const parseDate = (d) => {
        console.log(d);
        if (!d) return null;
        if (d.seconds !== undefined) return new Date(d.seconds * 1000);
        return new Date(d);
      };
    
    const latestCertDate = pastCertificates.length > 0
    ? parseDate(pastCertificates[pastCertificates.length - 1].date)
    : null;

    const filtered = reviews
    .filter((r) => {
        if (r.status !== "Approved") return false;
        if (!r.date_received) return false;
        if (latestCertDate && parseDate(r.date_processed) <= latestCertDate) return false;
        const matchSearch = r.bookTitle.toLowerCase().includes(search.toLowerCase());
        return matchSearch;
    })
    .sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    const data = pastCertificates
    .map((cert, index) => {
        const certReviewIds = cert.reviews ?? [];
        
        const certBooks = certReviewIds
            .map(id => reviews.find(r => r.id === id))
            .filter(Boolean)
            .map(r => ({ title: r.bookTitle, author: r.author }));
    
        const hours = (certBooks.length * 0.5).toFixed(1);
    
        const date = parseDate(cert.date);
        const dateStr = date
            ? `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(-2)}`
            : "Unknown";
    
        return {
            id: index + 1,
            date: dateStr,
            parsedDate: date,
            hours,
            books: certBooks,
        };
    })
    .sort((a, b) => {
        if (!a.parsedDate) return 1;
        if (!b.parsedDate) return -1;
        return b.parsedDate - a.parsedDate;
    })
    .map((cert, index) => ({ ...cert, id: index + 1 }));

    useEffect(() => {
        return () => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, []);

    const fetchUserReviews = async (user) => {
        try {
        if (!user) return;

        const idToken = await user.getIdToken(true);

        const res = await fetch("https://bibliomaniacs-ytnd.onrender.com/get_user_reviews", {
            method: "POST",
            headers: {
            "Content-Type": "application/json",
            },
            body: JSON.stringify({ idToken }),
        });

        const data = await res.json();

        if (!res.ok) {
            console.error("Backend error:", data);
            return;
        }

        setReviews(
            data.reviews.map(r => ({
            id: r.id,
            bookTitle: r.book_title,
            author: r.author,
            review: r.review,
            rating: r.rating,
            status: r.status,
            status: r.status,
            date_processed: r.date_processed,
            createdAt: r.date_received,
            comment: r.comment_to_user,
            timeEarned: r.time_earned,
            first_name: r.first_name,
            last_name: r.last_name,
            email: user.email,
            phone_number: r.phone_number,
            school: r.school,
            grade: r.grade,
            recommended_audience_grade: r.recommended_audience_grade,
            anonymous: r.anonymous,
            date_received: r.date_received,
            }))
        );
        } catch (err) {
        console.error("Failed to load reviews:", err);
        } finally {
        setLoading(false);
        }
    };

    const fetchUserProfile = async (user) => {
        try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
            const data = snap.data();
            setFirstName(data.first_name ?? "");
            setLastName(data.last_name ?? "");
            setGradeLevel(data.grade ?? "");
            setEmail(data.email ?? "");
            setPhoneNumber(data.phone ?? "");
            setSchool(data.school ?? "");
            setPastCertificates(data.past_certificates ?? []);
        } else {
            setFirstName("");
            setLastName("");
            setGradeLevel("");
            setEmail("");
            setPhoneNumber("");
            setSchool("");
            setPastCertificates([]);
        }
        } catch (err) {
        console.error("Failed to load profile:", err);
        } finally {
        setLoading(false);
        }
    };

    useEffect(() => {
        const auth = getAuth();

        const unsubscribe = auth.onAuthStateChanged((user) => {
        if (!user) {
            setLoading(false);
            return;
        }

        fetchUserReviews(user);
        fetchUserProfile(user);
        });

        return () => unsubscribe();
    }, []);

    const toggleRow = (id) => {
        setOpenRows((prev) => ({
          ...prev,
          [id]: !prev[id],
        }));
      };


      const generateCertificate = async (certDate = null, certHours = null) => {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return;
    
        const idToken = await user.getIdToken(true);
        
        const res = await fetch("https://bibliomaniacs-ytnd.onrender.com/generate_certificate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken, firstName, lastName, certDate, certHours }),
        });
    
        if (!res.ok) {
            console.error("Failed to generate certificate");
            return;
        }
    
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `volunteer_certificate_${firstName}_${lastName}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
    };


    const create_new_certificate = async (cert_date, cert_hours) => {
        generateCertificate(cert_date, cert_hours);
        try {
            const auth = getAuth();
            const user = auth.currentUser;
            if (!user) return;
        
            const idToken = await user.getIdToken(true);
        
            const res = await fetch("https://bibliomaniacs-ytnd.onrender.com/update_certificate", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ idToken }),
            });
        
            const data = await res.json();
        
            if (!res.ok) {
              console.error("Backend error:", data);
              return;
            }
        
          } catch (err) {
            console.error("Failed to update certificate:", err);
          } finally {
            setLoading(false);
        }
    }


    return (
    <RequireAccess
      allowRoles={["user", "admin"]}
      redirectTo="/notfound"
    >
        <h1 className="text-4xl text-center font-bold text-gray-800 mt-8">
                    Volunteer Hour Dashboard
        </h1>
        <div className="grid grid-cols-2 gap-8 h-screen pt-6 pb-10 bg-gray-100 overflow-hidden">
            <div className="flex flex-col h-full min-h-0 bg-gray-50 ml-16 rounded-2xl shadow-md p-8">
                <h1 className="text-3xl text-center font-bold text-gray-800 mb-6">
                    Undocumented Hours
                </h1>
                <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-white rounded-lg shadow-sm p-4">
                    <div className="text-s text-gray-700 font-[500]">TOTAL REVIEWS</div>
                    <div className="text-3xl font-bold text-gray-700">{filtered.length}</div>
                    <div className="text-xs text-gray-500 font-[500]">Undocumented</div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-4">
                    <div className="text-s text-gray-700 font-[500]">TOTAL HOURS</div>
                    <div className="text-3xl font-bold text-gray-700">{filtered.length*0.5}</div>
                    <div className="text-xs text-gray-500 font-[500]">Undocumented</div>
                    </div>
                </div>


                <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
                    {loading ? (
                        <div className="text-center py-12 text-gray-500">Loading reviews...</div>
                    ) : (
                        <div className="h-full overflow-y-auto">
                            <table className="w-full min-w-max h-full">
                                <thead className="bg-green-50 border-b-2 border-green-200">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-bold text-gray-700 text-sm">Book Title</th>
                                        <th className="px-4 py-3 text-left font-bold text-gray-700 text-sm">Date</th>
                                        <th className="px-4 py-3 text-left font-bold text-gray-700 text-sm">Hrs</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((r) => {
                                    const status = r.approved ? "Approved" : (r.date_processed ? "Rejected" : "Pending");

                                    return (
                                        <tr key={r.id} className="border-b border-green-100 hover:bg-green-50 transition-colors">

                                        <td className="px-4 py-3 text-sm font-medium text-gray-800">{r.bookTitle}</td>

                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {new Date(r.date_received).toLocaleDateString()}
                                        </td>
                                        
                                        <td className="px-4 py-3 text-sm text-gray-700">0.5</td>
                                        </tr>
                                    );
                                    })}
                                    {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan="9" className="text-center py-12 text-gray-500">
                                        No undocumented reviews
                                        </td>
                                    </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <div className="mt-6 flex justify-center">
                    <button
                        className={`bg-green-900 hover:bg-green-950 text-white font-bold py-4 px-8 rounded-lg text-lg transition-colors shadow-md ${filtered.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={(e) => {
                            create_new_certificate(new Date(), filtered.length * 0.5);
                        }}
                        disabled={filtered.length === 0}
                    >
                        Generate Certificate
                    </button>
                </div>
            </div>
            <div className="flex flex-col h-full min-h-0 mr-16 bg-gray-50 rounded-2xl shadow-lg p-8">
                <h1 className="text-3xl ml-1 font-bold text-center text-gray-700 mb-6">
                    ARCHIVE
                </h1>

                <div className="w-full bg-white rounded-lg shadow-sm overflow-hidden">
                    <table className="w-full border-collapse">
                        <thead className="bg-gray-200 border-b border-gray-400">
                        <tr>
                            <th className="px-4 py-3 text-left text-sm font-bold">Date</th>
                            <th className="px-4 py-3 text-left text-sm font-bold">Hours</th>
                            <th></th>
                        </tr>
                        </thead>

                        <tbody>
                        {data.map((row) => (
                            <React.Fragment key={row.id}>
                            {/* Main Row */}
                            <tr
                                onClick={() => toggleRow(row.id)}
                                className="cursor-pointer border-b hover:bg-gray-50 transition"
                            >
                                <td className="px-4 py-3 font-medium text-gray-800">
                                    {openRows[row.id] ? "▼" : "▶"} {row.date}
                                </td>
                                <td className="px-4 py-3 text-gray-700">{row.hours}</td>
                                <td className="px-4 py-3">
                                    <Feather name = "download" size={17}
                                        onClick={(e) => {
                                            e.stopPropagation(); // prevent row toggle
                                            generateCertificate(row.parsedDate, row.hours);
                                        }}
                                        className="text-gray-700 font-bold hover:underline text-sm"
                                    >
                                        
                                    </Feather>
                                </td>
                            </tr>

                            {/* Dropdown Rows */}
                            {openRows[row.id] &&
                                (row.books.length > 0 ? (
                                row.books.map((book, i) => (
                                    <tr
                                    key={i}
                                    className="bg-gray-50 border-b text-sm text-gray-600"
                                    >
                                    <td className="px-8 py-2">{book.title}</td>
                                    <td className="px-4 py-2">{book.author}</td>
                                    <td></td>
                                    </tr>
                                ))
                                ) : (
                                <tr className="bg-gray-50 border-b text-sm text-gray-500">
                                    <td colSpan="2" className="px-8 py-2 italic">
                                    No books logged
                                    </td>
                                </tr>
                                ))}
                            </React.Fragment>
                        ))}
                        </tbody>
                    </table>
                    </div>
            </div>
        </div>
    </RequireAccess>
  );
}
