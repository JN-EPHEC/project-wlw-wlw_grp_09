import React, { useState } from "react";
import { saveDriver } from "./firestoreUsers";

const DriverRegistrationForm = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [carPlate, setCarPlate] = useState("");
  const [carModel, setCarModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);

    try {
      await saveDriver({
        firstName,
        lastName,
        email,
        phone,
        carPlate,
        carModel,
      });

      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setCarPlate("");
      setCarModel("");
      setSuccess(true);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Une erreur est survenue, veuillez réessayer.");
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        name="firstName"
        placeholder="Prénom"
        value={firstName}
        onChange={(event) => setFirstName(event.target.value)}
      />
      <input
        type="text"
        name="lastName"
        placeholder="Nom"
        value={lastName}
        onChange={(event) => setLastName(event.target.value)}
      />
      <input
        type="email"
        name="email"
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <input
        type="tel"
        name="phone"
        placeholder="Téléphone"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
      />
      <input
        type="text"
        name="carPlate"
        placeholder="Plaque"
        value={carPlate}
        onChange={(event) => setCarPlate(event.target.value)}
      />
      <input
        type="text"
        name="carModel"
        placeholder="Voiture"
        value={carModel}
        onChange={(event) => setCarModel(event.target.value)}
      />
      <button type="submit" disabled={loading}>
        {loading ? "Enregistrement..." : "Devenir conducteur"}
      </button>
      {success && <p>Conducteur enregistré avec succès.</p>}
      {error && <p>{error}</p>}
    </form>
  );
};

export default DriverRegistrationForm;
