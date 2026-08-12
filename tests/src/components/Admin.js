// src/components/admin/Admin.js
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import incidentImage from '../assets/images/incident-icon.png';
import { API_BASE_URL } from "../config/api";
import { getBasemapTileLayerProps } from "./map/mapBasemap";

const incidentIcon = new L.Icon({
  iconUrl: incidentImage,
  iconSize: [35, 35],
  iconAnchor: [17, 35],
  popupAnchor: [0, -35],
});

// Pasig bounds
const PASIG_BOUNDS = {
  north: 14.602,
  south: 14.542,
  west: 121.055,
  east: 121.105,
};

export default function Admin() {
  const navigate = useNavigate();
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [statusMap, setStatusMap] = useState({});
  const basemapTileProps = getBasemapTileLayerProps();

  useEffect(() => {
    const storedRole = localStorage.getItem('role');
    if (!storedRole) navigate('/');
  }, [navigate]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/incident/getIncidents`);
        setIncidents(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleChange = async (id, value) => {
    try {
      const incident = incidents.find(i => i._id === id);

      // Update status in DB
      await axios.put(`${API_BASE_URL}/incident/updateStatus/${id}`, {
        status: value
      });

      // Save history
      await axios.post(`${API_BASE_URL}/history/registerHistory`, {
        action: 'STATUS_UPDATE',
        placeName: incident.location,
        details: incident.description,
      });

      // Update UI
      setIncidents(prev =>
        prev.map(i => i._id === id ? { ...i, status: value } : i)
      );
      setStatusMap(prev => ({ ...prev, [id]: value }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    const incident = incidents.find(i => i._id === id);

    await axios.post(`${API_BASE_URL}/history/registerHistory`, {
      action: 'DELETE',
      placeName: incident.location,
      details: incident.description,
    });

    try {
      await axios.delete(`${API_BASE_URL}/incident/delete/${id}`);
      setIncidents(prev => prev.filter(i => i._id !== id));
      setStatusMap(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ padding: '16px' }}>
      <h1>Incident Administration</h1>

      <h3>Incident Map</h3>
      <div style={{ height: '400px', marginBottom: '20px' }}>
        <MapContainer
          center={[14.5764, 121.0621]}
          zoom={15}
          style={{ height: '100%', width: '100%' }}
          maxBounds={[
            [PASIG_BOUNDS.south, PASIG_BOUNDS.west],
            [PASIG_BOUNDS.north, PASIG_BOUNDS.east],
          ]}
          maxBoundsViscosity={1.0}
        >
          <TileLayer {...basemapTileProps} />
          {incidents.map(incident => (
            incident.latitude != null && incident.longitude != null && (
              <Marker
                key={incident._id}
                position={[incident.latitude, incident.longitude]}
                icon={incidentIcon}
                eventHandlers={{
                  click: () => setSelectedIncident(incident)
                }}
              >
                <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                  <div>
                    <strong>{incident.type?.toUpperCase()}</strong><br />
                    Status: {incident.status}<br />
                    Severity: {incident.level}<br />
                    {incident.location}<br />
                    {incident.description}
                  </div>
                </Tooltip>
              </Marker>
            )
          ))}
        </MapContainer>
      </div>

      <h3>Manage Incident Statuses</h3>
      <div style={{ overflowX: 'auto' }}>
        <table border="1" cellPadding="6" cellSpacing="0" style={{ width: '100%', fontSize: 14 }}>
          <thead>
            <tr>
              <th>Type</th>
              <th>Level</th>
              <th>Description</th>
              <th>Location</th>
              <th>Status</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map(inc => (
              <tr key={inc._id}>
                <td>{inc.type}</td>
                <td>{inc.level}</td>
                <td>{inc.description}</td>
                <td>{inc.location}</td>
                <td>
                  <select
                    value={statusMap[inc._id] || inc.status || ''}
                    onChange={e => handleChange(inc._id, e.target.value)}
                  >
                    <option value="">Reported</option>
                    <option value="onProcess">On Process</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </td>
                <td>
                  <button onClick={() => handleDelete(inc._id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedIncident && (
        <div className="modal">
          <h2>{selectedIncident.type}</h2>
          <p>Status: {selectedIncident.status}</p>
          <p>Severity: {selectedIncident.level}</p>
          <p>{selectedIncident.location}</p>
          <p>{selectedIncident.description}</p>
          <p> Username: {selectedIncident.usernames}</p>
          <p> Phone: {selectedIncident.phone}</p>

          <button onClick={() => setSelectedIncident(null)}>Close</button>
        </div>
      )}
    </div>
  );
}
