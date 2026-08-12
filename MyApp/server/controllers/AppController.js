import {BrowserRouter, Route, Routes} from 'react-router-dom'
// import Login from './Login'
// import Signup from './Signup'
import 'leaflet/dist/leaflet.css';
import './MapIcon'
import Map from  './Map'


const AppController = () => {
    return(
        <BrowserRouter>
            <Routes>
                {/* <Route path='/' element={<Login/>}/>
                <Route path='/Register' element={<Signup/>}/> */}
                <Route path='/SampleMap' element={<Map/>}/>
            </Routes>
        </BrowserRouter>
    )
}

export default AppController