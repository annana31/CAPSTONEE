import { useState } from "react";

export default function StudentPreview() {
  const [studentId, setStudentId] = useState("");
  const [showForm, setShowForm] = useState(false);

  const requests = [
    {
      id: "20230001",
      requestType: "Transcript of Records",
      status: "Pending",
      date: "June 6, 2026",
    },
    {
      id: "20230001",
      requestType: "Certificate of Enrollment",
      status: "Approved",
      date: "June 2, 2026",
    },
  ];

  const studentRequests = requests.filter(
    (request) => request.id === studentId
  );

  return (
    <div className="min-h-screen bg-gray-100 px-6 py-12">
      <div className="max-w-4xl mx-auto">

        {/* TITLE */}
        <h1 className="text-4xl font-bold text-center text-[#0A2342] mb-10">
          Track Requests
        </h1>

        {/* SEARCH CARD */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-md p-6">
          <label className="block text-sm font-semibold text-[#0A2342] mb-2">
            Student ID
          </label>

          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Enter Student ID"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="flex-1 border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#D4A017]"
            />

            <button className="bg-[#0A2342] hover:bg-[#081b34] text-white px-6 py-3 rounded-xl font-medium transition">
              Search
            </button>
          </div>

          <button
            onClick={() => setShowForm(!showForm)}
            className="mt-4 text-[#D4A017] font-medium hover:underline"
          >
            + Submit Request
          </button>
        </div>

        {/* FORM */}
        {showForm && (
          <div className="mt-8 bg-white border border-gray-200 rounded-2xl shadow-md p-6">
            <h2 className="text-xl font-semibold text-[#0A2342] mb-6">
              Request Form
            </h2>

            <div className="grid md:grid-cols-2 gap-5">

              <input className="border p-3 rounded-lg" placeholder="Student ID" />
              <input className="border p-3 rounded-lg" placeholder="Full Name" />

              {/* ✅ EMAIL FIELD ADDED */}
              <input
                type="email"
                className="border p-3 rounded-lg md:col-span-2"
                placeholder="Email Address"
              />

              <input className="border p-3 rounded-lg" placeholder="Course" />

              {/* YEAR LEVEL */}
              <div className="relative">
                <select className="w-full border p-3 pr-10 rounded-lg appearance-none">
                  <option>1st Year</option>
                  <option>2nd Year</option>
                  <option>3rd Year</option>
                  <option>4th Year</option>
                </select>

                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                  ▼
                </div>
              </div>

              {/* REQUEST TYPE */}
              <div className="relative md:col-span-2">
                <select className="w-full border p-3 pr-10 rounded-lg appearance-none">
                  <option>Transcript of Records</option>
                  <option>Certificate of Enrollment</option>
                  <option>Good Moral Certificate</option>
                  <option>Certificate of Grades</option>
                </select>

                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                  ▼
                </div>
              </div>

              <textarea
                className="md:col-span-2 border p-3 rounded-lg"
                rows="4"
                placeholder="Purpose of request"
              />
            </div>

            <button className="mt-6 bg-[#D4A017] hover:bg-[#be9114] text-white px-6 py-3 rounded-xl font-medium">
              Submit Request
            </button>
          </div>
        )}

        {/* RESULTS */}
        <div className="mt-8">

          {studentId && (
            <>
              <h2 className="text-xl font-semibold text-[#0A2342] mb-4">
                Current Requests
              </h2>

              {studentRequests.length > 0 ? (
                <div className="space-y-4">

                  {studentRequests.map((request, index) => (
                    <div
                      key={index}
                      className="bg-white border border-gray-200 rounded-2xl shadow-md p-5 flex justify-between items-center"
                    >
                      <div>
                        <p className="font-semibold text-[#0A2342]">
                          {request.requestType}
                        </p>
                        <p className="text-gray-500 text-sm">
                          Submitted: {request.date}
                        </p>
                      </div>

                      <span
                        className={`px-4 py-2 rounded-full text-sm font-medium ${
                          request.status === "Approved"
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {request.status}
                      </span>
                    </div>
                  ))}

                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-md p-8 text-center">
                  <p className="text-gray-500 text-lg">
                    No Request Found
                  </p>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}