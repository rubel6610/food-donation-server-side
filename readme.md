# 🍽️ Local Food Waste Reduction Platform

A full-stack MERN web application designed to minimize food waste by connecting **Restaurants** with **Charities**. Restaurants can donate excess food, while Charities can request and pick it up for redistribution to the needy.

---

## 🌐 Live Site

🔗 **[Visit the Live Website](https://sage-gumption-dbbe8e.netlify.app)**

---

## 👨‍💼 Admin Login

- **Email:** arfan@gmail.com 
- **Password:** Rubel.0182@

---

## 🚀 Key Features

1. 🔐 **Firebase Authentication** with Email/Password and Google login  
2. 🏠 **Homepage** with responsive layout, hero section, featured donations, and animations  
3. 📦 **All Donations Page** with:
   - Sorting (by quantity or pickup time)
   - Donation filtering
   - View Details feature
4. ❤️ **Charity Role Request System** (via Stripe one-time payment & admin approval)
5. 🧾 **Donation Details Page** showing:
   - Image, food type, quantity, pickup time
   - Save to Favorites, Request Donation buttons
6. 🧮 **Restaurant Dashboard**:
   - Add, Edit, Delete donations
   - View donation statistics (Pie chart via Recharts)
7. 🎯 **Charity Dashboard**:
   - View requested donations
   - Track pickups and confirm collection
   - Leave reviews for food received
8. 🛡️ **Admin Dashboard**:
   - Manage users and roles
   - Approve or reject Charity role requests
   - Monitor donation activity and transactions
9. 📊 **Recharts Integration** for data visualization
10. 🔒 **Protected Routes** based on user roles (Restaurant, Charity, Admin)
11. 💰 **Stripe Payment Integration** for secure Charity role activation
12. 📱 **Fully Responsive Design** – works smoothly on desktop and mobile devices

---

## 🧪 Tech Stack

| Frontend             | Backend                |
|----------------------|------------------------|
| React, Tailwind CSS  | Node.js, Express.js    |
| React Router DOM     | MongoDB, 
| Firebase Auth & SDK  | Stripe (Payments)      |
| Axios, Recharts      | dotenv, CORS, JWT      |

---

## ⚙️ Setup Instructions

### Prerequisites
- Node.js
- MongoDB URI
- Firebase Project
- Stripe Secret Key

